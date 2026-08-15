// js/engine/Game.js
// 游戏主控制器: 整合 场景/相机/渲染/输入/世界/玩家/武器/AI/HUD/音频/菜单
// 占点模式: 攻击方占领全部据点或耗尽敌方兵力券即胜

import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import { Input } from './Input.js';
import { World } from '../world/World.js';
import { PlayerController } from '../player/PlayerController.js';
import { WeaponSystem } from '../player/WeaponSystem.js';
import { Soldier } from '../ai/Soldier.js';
import { AudioManager } from '../audio/AudioManager.js';
import { HUD } from '../ui/HUD.js';
import { MainMenu } from '../ui/MainMenu.js';
import { CAMPAIGNS } from '../data/campaigns.js';
import { FACTIONS } from '../data/factions.js';
import { WEAPONS } from '../data/weapons.js';
import { randPick, randRange, clamp } from '../utils/MathUtils.js';
import { Tank } from '../world/Tank.js';
import { log } from '../utils/logger.js';
const L = log('Game');

export class Game {
  constructor(canvas) {
    this.canvas = canvas;

    // Three.js 场景与相机
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 600);
    this.scene.add(this.camera); // 相机加入场景, 使其子级(视图模型/枪口光)可渲染

    // 子系统
    this.input = new Input(canvas);
    this.audio = new AudioManager(this.camera);
    this.hud = new HUD();
    this.menu = new MainMenu();
    this.menu.bindAudio(this.audio);   // 让主菜单能调音量

    this.renderer = null;
    this.world = null;
    this.player = null;
    this.weapons = null;
    this.soldiers = [];
    this.tanks = [];

    this.state = 'menu';   // menu / playing / paused / dead / victory / defeat
    this.attackerTeam = null;
    this.defenderTeam = null;
    this.tickets = { attacker: 0, defender: 0 };
    this.respawnTimer = 0;

    this.lastTime = 0;
    this.fpsAcc = 0; this.fpsFrames = 0; this.fpsTime = 0;

    // 调试面板
    this._dbEl = document.getElementById('debugPanel');
    this._dbContent = document.getElementById('dpContent');
    this._dbVisible = true;
    this._dbCooldown = 0;

    this._bindUI();
    window.addEventListener('resize', () => this._onResize());
    // F12 切换调试面板显示
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F12') { e.preventDefault(); this._toggleDebugPanel(); }
    });

    L.info('Game created');
  }

  _toggleDebugPanel() {
    this._dbVisible = !this._dbVisible;
    if (this._dbEl) this._dbEl.classList.toggle('hidden', !this._dbVisible);
  }

  _bindUI() {
    this.menu.onStart(() => this._startGame());
    this.hud.el.respawnBtn.onclick = () => this._respawn();
    this.hud.el.resumeBtn.onclick = () => this._togglePause(false);
    this.hud.el.quitBtn.onclick = () => this._quitToMenu();
  }

  // ========== 开始游戏 ==========
  _startGame() {
    const sel = this.menu.getSelection();
    const campaign = CAMPAIGNS[sel.campaign];
    L.info('start campaign=' + sel.campaign + ' faction=' + sel.faction + ' quality=' + sel.quality);

    // 渲染器
    if (!this.renderer) {
      this.renderer = new Renderer(this.canvas, sel.quality, { bloom: sel.bloom, shadows: sel.shadows });
    } else {
      this.renderer.setQuality(sel.quality, { bloom: sel.bloom, shadows: sel.shadows });
    }
    this.renderer.setScene(this.scene);
    this.renderer.setCamera(this.camera);

    // 清理旧场景内容
    this._clearScene();

    // 世界
    this.world = new World(this.scene, campaign, this.audio);
    this.attackerTeam = campaign.attacker;
    this.defenderTeam = campaign.defender;
    this.tickets = { attacker: campaign.tickets, defender: campaign.tickets };

    // 玩家(默认攻击方)
    const playerTeam = sel.faction === campaign.attacker ? campaign.attacker : campaign.defender;
    this.player = new PlayerController(this.camera, this.scene, this.input, this.world);
    this.player.team = playerTeam;
    this.player.isPlayer = true;
    this.world.player = this.player;

    // 武器
    this.weapons = new WeaponSystem(this.player, this.scene, this.world, this.audio, this.hud);
    this.weapons.setLoadout(sel.primary, sel.secondary, sel.grenade);

    // 玩家受击/死亡回调
    this.player.onDamage = (hp, ar, hs) => {
      this.hud.updateVitals(hp, ar);
    };
    this.player.onDeath = (killer) => {
      this.state = 'dead';
      this.hud.showDeath(killer);
      this.input.exitPointerLock();
      this.respawnTimer = 8;
      this._onSoldierDeath(this.player); // 玩家死亡也扣券
    };
    this.weapons.onShoot = (origin, dir, w) => {
      // 枪声惊动附近敌方 AI
      this._alertNearbyEnemies(origin, 40, this.player);
    };
    this.weapons.onHit = (soldier, hs) => {
      // 命中已由 soldier.takeDamage 处理
    };
    this.weapons.onKill = (victim, attacker, weapon) => {
      this.hud.addKill(attacker, victim, weapon);
      // 扣券统一在 victim 的 onDeath 回调里处理, 避免重复
    };

    // 生成士兵(双方)
    this._spawnSoldiers(campaign, playerTeam);

    // 生成坦克(每方1辆)
    this._spawnTanks(campaign, playerTeam);

    // 玩家出生点(攻击方出生在据点后方)
    const spawnSide = playerTeam === campaign.attacker ? -1 : 1;
    const spawn = new THREE.Vector3(randRange(-30,30), 0, 70 * spawnSide);
    this.player.reset(spawn);

    // 显示 HUD
    this.menu.hide();
    this.hud.show();
    this.hud.updateVitals(this.player.health, this.player.armor);

    // 启动音频(用户交互后)
    this.audio.init();
    this.audio.resume();

    // 进入游戏, 锁定指针
    this.state = 'playing';
    setTimeout(() => this.input.requestPointerLock(), 100);

    this.lastTime = performance.now();
    if (!this._looping) {
      this._looping = true;
      this._loop();
    }
  }

  _spawnSoldiers(campaign, playerTeam) {
    this.soldiers = [];
    const total = campaign.teamSize;
    const atkCount = Math.floor(total / 2) - 1; // 玩家占攻击方一个名额
    const defCount = total - atkCount - 1;

    // 攻击方出生在 +z 侧, 防守方在 -z 侧
    const atkZ = 70, defZ = -70;
    for (let i = 0; i < atkCount; i++) {
      const pos = new THREE.Vector3(randRange(-40,40), 0, atkZ + randRange(-8,8));
      const sid = 'atk_' + i;
      const s = new Soldier(campaign.attacker, pos, this.world, this.audio, { id: sid });
      this._setupSoldier(s, campaign.attacker, 'advance');
      L.info('spawn soldier id=' + sid + ' team=' + campaign.attacker + ' pos=' + pos.x.toFixed(0) + ',' + pos.z.toFixed(0));
    }
    for (let i = 0; i < defCount; i++) {
      const pos = new THREE.Vector3(randRange(-50,50), 0, defZ + randRange(-8,8));
      const sid = 'def_' + i;
      const s = new Soldier(campaign.defender, pos, this.world, this.audio, { id: sid });
      // 防守方: 无敌人时在据点附近巡逻; 有任务进攻时再 advance
      this._setupSoldier(s, campaign.defender, 'patrol');
      L.info('spawn soldier id=' + sid + ' team=' + campaign.defender + ' pos=' + pos.x.toFixed(0) + ',' + pos.z.toFixed(0));
    }

    // 注入到世界
    this.world.soldiers = this.soldiers;
    // 设置敌对关系
    for (const s of this.soldiers) {
      s.setEnemyTeam(this._enemiesOf(s.team));
    }
    this.player._enemies = this._enemiesOf(playerTeam);
  }

  _setupSoldier(s, faction, order = 'advance') {
    s.squadOrder = order;
    s.onKill = (victim, killer) => {
      this.hud.addKill(killer, victim, s.weapon);
      // 扣券统一在 victim.onDeath 里处理, 避免双重扣除
    };
    s.onDeath = (dead) => {
      // 统一扣券入口: 所有死亡(子弹/手雷/任何原因)都走这里
      this._onSoldierDeath(dead);
    };
    this.soldiers.push(s);
  }

  _enemiesOf(team) {
    const enemies = [];
    if (team !== this.player.team) enemies.push(this.player);
    for (const s of this.soldiers) {
      if (s.team !== team) enemies.push(s);
    }
    return enemies;
  }

  _spawnTanks(campaign, playerTeam) {
    this.tanks = [];
    // 攻击方坦克
    const atkTank = new Tank(campaign.attacker, new THREE.Vector3(randRange(-20,20), 0, 75), this.world, this.audio);
    atkTank.team = campaign.attacker;
    this.tanks.push(atkTank);
    // 防守方坦克
    const defTank = new Tank(campaign.defender, new THREE.Vector3(randRange(-20,20), 0, -75), this.world, this.audio);
    defTank.team = campaign.defender;
    this.tanks.push(defTank);
    // 把坦克加入世界射线目标
    this.world.tanks = this.tanks;
    this.world.soldiers = [...this.soldiers]; // 确保
  }

  // ========== 主循环 ==========
  _loop = () => {
    if (!this._looping) return;
    requestAnimationFrame(this._loop);
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = Math.min(dt, 0.05); // 最大步长, 防止卡顿穿透

    this._update(dt);
    this.renderer.render();

    // FPS
    this.fpsFrames++; this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      const fps = Math.round(this.fpsFrames / this.fpsTime);
      this.hud.setFPS(fps);
      L.debug('fps=' + fps + ' entities=' + (this.soldiers.length + this.tanks.length));
      this.fpsFrames = 0; this.fpsTime = 0;
    }

    // 调试面板刷新 (节流到 5Hz)
    if (this._dbVisible && this._dbContent) {
      this._dbCooldown -= dt;
      if (this._dbCooldown <= 0) {
        this._dbCooldown = 0.2;
        this._updateDebugPanel();
      }
    }

    this.input.endFrame();
  };

  _update(dt) {
    this.audio.update(dt);

    if (this.state === 'playing') {
      // 暂停键
      if (this.input.justPressed('Escape')) { this._togglePause(true); return; }

      this.player.update(dt);
      this.weapons.update(dt);
      for (const s of this.soldiers) s.update(dt);
      // 清理已被世界移除的士兵(布娃娃结束后)
      this.soldiers = this.soldiers.filter(s => !s._removed);
      this.world.soldiers = this.soldiers;
      for (const t of this.tanks) t.update(dt);
      this.world.updateProjectiles(dt);
      this.world.updateObjectives(dt, this.attackerTeam, this.defenderTeam);
      this.world.update(dt);

      // 小队指令
      this._handleSquadCommands();

      // HUD 更新
      this.hud.update(dt);
      this.hud.updateCrosshair(this._currentSpread());
      // 当前关注据点(最近的争夺中)
      const obj = this._currentObjective();
      if (obj) this.hud.updateObjective(obj, this.attackerTeam);
      this.hud.drawMinimap(this.player, this.soldiers, this.world.objectives, this.world);

      // 载具互动
      this._handleVehicleInteraction();

      // 胜负判定
      this._checkVictory();
    } else if (this.state === 'dead') {
      // 死亡时仍渲染世界(旁观)
      for (const s of this.soldiers) s.update(dt);
      this.soldiers = this.soldiers.filter(s => !s._removed);
      this.world.soldiers = this.soldiers;
      for (const t of this.tanks) t.update(dt);
      this.world.updateProjectiles(dt);
      this.world.updateObjectives(dt, this.attackerTeam, this.defenderTeam);
      this.world.update(dt);
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this._respawn();
    } else if (this.state === 'paused') {
      if (this.input.justPressed('Escape')) this._togglePause(false);
    }
  }

  _currentSpread() {
    if (!this.weapons || !this.weapons.current) return 0.02;
    const w = this.weapons.current;
    const sp = this.player.isADS ? w.adsSpread : w.spread;
    const mul = this.player.isSprinting ? 3 : (Math.hypot(this.player.velocity.x, this.player.velocity.z) > 1 ? 1.6 : 1);
    return sp * mul;
  }

  _currentObjective() {
    // 玩家附近的据点
    let best = null, bestD = Infinity;
    for (const obj of this.world.objectives) {
      const op = new THREE.Vector3(...obj.position);
      const d = this.player.position.distanceTo(op);
      if (d < 40 && d < bestD) { bestD = d; best = obj; }
    }
    return best || this.world.objectives[0];
  }

  // ========== 小队指令 ==========
  _handleSquadCommands() {
    if (this.input.justPressed('KeyV')) {
      // 循环: advance -> hold -> follow
      const orders = ['advance', 'hold', 'follow'];
      const cur = this._squadOrder || 'advance';
      const idx = orders.indexOf(cur);
      const next = orders[(idx + 1) % orders.length];
      this._squadOrder = next;
      const orderNames = { advance: '进攻!', hold: '坚守阵地!', follow: '跟随我!' };
      this.hud.showSquadOrder('小队指令: ' + orderNames[next]);
      // 仅同阵营附近 AI 响应
      for (const s of this.soldiers) {
        if (s.team !== this.player.team) continue;
        if (s.position.distanceTo(this.player.position) < 60) {
          s.squadOrder = next;
          if (next === 'follow') s.moveTarget = this.player.position.clone();
          else if (next === 'advance') s.moveTarget = null;
          else if (next === 'hold') { s.moveTarget = s.position.clone(); s.state = 'hold'; }
        }
      }
    }
    // follow 模式: 持续更新跟随目标
    if (this._squadOrder === 'follow') {
      for (const s of this.soldiers) {
        if (s.team !== this.player.team) continue;
        if (s.squadOrder === 'follow' && s.position.distanceTo(this.player.position) > 8) {
          s.moveTarget = this.player.position.clone();
        }
      }
    }
  }

  // ========== 载具 ==========
  _handleVehicleInteraction() {
    if (this.input.justPressed('KeyT')) {
      if (this._drivingTank) {
        // 下车
        this._drivingTank.exit(this.player);
        this._drivingTank = null;
        this.hud.showToast('已下车', 1.5);
      } else {
        // 寻找附近己方坦克
        for (const t of this.tanks) {
          if (t.team !== this.player.team) continue;
          if (!t.alive) continue;
          if (t.driver) continue;
          if (this.player.position.distanceTo(t.position) < 6) {
            t.enter(this.player, this.weapons);
            this._drivingTank = t;
            this.hud.showToast('已驾驶坦克 (鼠标=炮塔/左键=开火/WASD=移动)', 3);
            break;
          }
        }
      }
    }
    if (this._drivingTank) {
      // 同步玩家位置到坦克
      this._drivingTank.syncPlayer(this.player);
    }
  }

  // ========== 警觉 ==========
  _alertNearbyEnemies(pos, radius, source) {
    for (const s of this.soldiers) {
      if (s.team === source.team) continue;
      if (!s.alive) continue;
      if (s.position.distanceTo(pos) < radius) {
        if (!s.target || s.state === 'idle') {
          s.lastSeenTargetPos = pos.clone();
          s.lastSeenTime = performance.now() / 1000;
          s.state = 'search';
          s.moveTarget = pos.clone();
        }
      }
    }
  }

  _onSoldierDeath(soldier, killer = null) {
    if (soldier.team === this.attackerTeam) this.tickets.attacker--;
    else this.tickets.defender--;
    L.info('soldier died id=' + (soldier.id || 'player') + ' team=' + soldier.team + ' killer=' + (killer?.team || '?') + ' tickets=' + JSON.stringify(this.tickets));
  }

  // ========== 胜负 ==========
  _checkVictory() {
    // 攻击方胜: 占领所有据点 或 防守方券归零
    const allHeld = this.world.objectives.every(o => o.holder === this.attackerTeam);
    if (allHeld || this.tickets.defender <= 0) {
      this._endGame(this.player.team === this.attackerTeam ? 'victory' : 'defeat');
    }
    // 防守方胜: 攻击方券归零
    else if (this.tickets.attacker <= 0) {
      this._endGame(this.player.team === this.defenderTeam ? 'victory' : 'defeat');
    }
  }

  _endGame(result) {
    this.state = result;
    L.info('state=' + result);
    this.input.exitPointerLock();
    this.hud.showToast(result === 'victory' ? '胜 利!' : '失 败', 999);
    setTimeout(() => {
      this.hud.hideToast();
      this._quitToMenu();
    }, 4000);
  }

  // ========== 重生 ==========
  _respawn() {
    if (this.state !== 'dead') return;
    const campaign = this.world.campaign;
    const spawnSide = this.player.team === this.attackerTeam ? 1 : -1;
    const spawn = new THREE.Vector3(randRange(-30,30), 0, 70 * spawnSide);
    this.player.reset(spawn);
    this.weapons.switchTo(0);
    this.hud.hideDeath();
    this.hud.updateVitals(this.player.health, this.player.armor);
    this.state = 'playing';
    setTimeout(() => this.input.requestPointerLock(), 100);
  }

  // ========== 暂停 ==========
  _togglePause(p) {
    if (p && this.state === 'playing') {
      this.state = 'paused';
      L.info('state=paused');
      this.hud.showPause();
      this.input.exitPointerLock();
    } else if (!p && this.state === 'paused') {
      this.state = 'playing';
      L.info('state=resumed');
      this.hud.hidePause();
      this.input.requestPointerLock();
      this.lastTime = performance.now();
    }
  }

  _quitToMenu() {
    this.state = 'menu';
    this.hud.hide();
    this.hud.hideDeath();
    this.hud.hidePause();
    this.input.exitPointerLock();
    this._clearScene();
    this.menu.show();
  }

  _clearScene() {
    // 移除所有可清理对象(保留相机)
    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0];
      this.scene.remove(obj);
      if (obj === this.camera) continue; // 相机不清理
      if (obj.traverse) obj.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); }
      });
    }
    // 确保相机仍在场景中(其子级如视图模型才能渲染)
    if (!this.scene.children.includes(this.camera)) this.scene.add(this.camera);
    // 清空 camera 子级(视图模型)
    for (let i = this.camera.children.length - 1; i >= 0; i--) {
      this.camera.remove(this.camera.children[i]);
    }
    this.soldiers = [];
    this.tanks = [];
    if (this.world) { this.world.soldiers = []; this.world.tanks = []; }
  }

  _onResize() {
    if (this.renderer) this.renderer.onResize();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ========== 调试面板 ==========
  _updateDebugPanel() {
    const el = this._dbContent;
    if (!el) return;

    const stateLabel = {
      menu: '主菜单', playing: '战斗中', paused: '暂停',
      dead: '已阵亡', victory: '胜利', defeat: '失败',
    }[this.state] || this.state;

    // FPS 在 _loop 里通过 hud.setFPS 设置, 直接读 DOM
    const fpsText = this.hud?.el?.fps?.textContent ?? '--';

    // 统计 AI 存活/死亡 (health<=0 即视为死亡)
    let atkAlive = 0, atkTotal = 0, defAlive = 0, defTotal = 0;
    for (const s of this.soldiers) {
      if (s.team === this.attackerTeam) { atkTotal++; if (s.health > 0) atkAlive++; }
      else { defTotal++; if (s.health > 0) defAlive++; }
    }

    // 音频已加载的 buffer 数量
    const audioInfo = this.audio && this.audio.buffers
      ? Object.keys(this.audio.buffers).length
      : 0;
    const audioEnabled = this.audio && this.audio.enabled ? '✓' : '✗';

    // 据点进度 (World 字段: holder / capProgress)
    const objectives = this.world && this.world.objectives ? this.world.objectives : [];
    const objLines = objectives.map(o => {
      const owner = o.holder || '中立';
      const prog = Math.round((o.capProgress || 0) * 100);
      return `<div class="dp-row"><span class="dp-key">  ${o.id}</span><span class="dp-val">${owner} ${prog}%</span></div>`;
    }).join('');

    // 玩家信息
    const p = this.player;
    let pInfo = '';
    if (p) {
      const hpClass = p.health > 60 ? 'ok' : p.health > 30 ? 'warn' : 'bad';
      const pos = p.camera?.position || p.position || { x: 0, y: 0, z: 0 };
      pInfo = `
        <div class="dp-section"><div class="dp-section-title">玩家</div>
          <div class="dp-row"><span class="dp-key">阵营</span><span class="dp-val">${p.team || '--'}</span></div>
          <div class="dp-row"><span class="dp-key">HP/AR</span><span class="dp-val ${hpClass}">${Math.round(p.health)}/${Math.round(p.armor)}</span></div>
          <div class="dp-row"><span class="dp-key">坐标</span><span class="dp-val">${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}</span></div>
        </div>`;
    }

    el.innerHTML = `
      <div class="dp-row"><span class="dp-key">状态</span><span class="dp-val ${this.state === 'playing' ? 'ok' : ''}">${stateLabel}</span></div>
      <div class="dp-row"><span class="dp-key">FPS</span><span class="dp-val">${fpsText}</span></div>
      <div class="dp-row"><span class="dp-key">战役</span><span class="dp-val">${this.world?.campaign?.name ?? '--'}</span></div>
      <div class="dp-row"><span class="dp-key">攻击方</span><span class="dp-val">${this.attackerTeam ?? '--'}</span></div>
      <div class="dp-row"><span class="dp-key">防守方</span><span class="dp-val">${this.defenderTeam ?? '--'}</span></div>

      <div class="dp-section"><div class="dp-section-title">兵力券</div>
        <div class="dp-row"><span class="dp-key">攻击方</span><span class="dp-val ${this.tickets.attacker < 30 ? 'bad' : ''}">${this.tickets.attacker}</span></div>
        <div class="dp-row"><span class="dp-key">防守方</span><span class="dp-val ${this.tickets.defender < 30 ? 'bad' : ''}">${this.tickets.defender}</span></div>
      </div>

      <div class="dp-section"><div class="dp-section-title">AI 存活</div>
        <div class="dp-row"><span class="dp-key">攻击方</span><span class="dp-val">${atkAlive}/${atkTotal}</span></div>
        <div class="dp-row"><span class="dp-key">防守方</span><span class="dp-val">${defAlive}/${defTotal}</span></div>
        <div class="dp-row"><span class="dp-key">坦克</span><span class="dp-val">${this.tanks?.length ?? 0}</span></div>
      </div>

      <div class="dp-section"><div class="dp-section-title">据点</div>${objLines || '<div class="dp-row"><span class="dp-key">--</span></div>'}</div>

      ${pInfo}

      <div class="dp-section"><div class="dp-section-title">音频</div>
        <div class="dp-row"><span class="dp-key">状态</span><span class="dp-val ${audioEnabled === '✓' ? 'ok' : 'bad'}">${audioEnabled}</span></div>
        <div class="dp-row"><span class="dp-key">已加载</span><span class="dp-val">${audioInfo}</span></div>
      </div>
    `;
  }
}
