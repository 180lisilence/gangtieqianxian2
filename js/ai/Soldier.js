// js/ai/Soldier.js
// AI 士兵: 第三人称人体模型 + AI 行为
// 行为状态机: idle / engage(战斗) / flank(包抄) / cover(躲掩体) / advance(推进) / regroup
// 寻路: 简化避障(直接朝目标 + 检测障碍绕行) + 据点目标
// 含受伤/死亡(布娃娃简化: 倒地动画 + 随机翻倒)

import * as THREE from 'three';
import { FACTIONS } from '../data/factions.js';
import { WEAPONS } from '../data/weapons.js';
import { clamp, randRange, smoothAngle, randPick, damp } from '../utils/MathUtils.js';
import { createSimpleRifle } from '../player/WeaponFactory.js';

const STAND_H = 1.75;

export class Soldier {
  constructor(factionId, position, world, audio, opts = {}) {
    this.faction = FACTIONS[factionId];
    this.world = world;
    this.audio = audio;
    this.team = factionId;     // 阵营 ID(用于敌我)
    this.id = opts.id || ('sol_' + Math.random().toString(36).slice(2,8));
    this.isPlayer = false;
    this.isAI = true;

    this.position = position.clone();
    this.position.y = world.getGroundHeight(position.x, position.z);
    this.velocity = new THREE.Vector3();
    this.yaw = randRange(0, Math.PI * 2);
    this.targetYaw = this.yaw;

    this.health = 100; this.maxHealth = 100;
    this.alive = true;
    this.deathTime = 0;

    // 武器
    const wlist = opts.weaponId ? [WEAPONS[opts.weaponId]] :
      [WEAPONS[randPick(this.faction.weapons.primary)]];
    this.weapon = wlist[0];
    this.ammoMag = this.weapon.magSize;
    this.ammoReserve = this.weapon.reserve;
    this.lastShotTime = 0;
    this.reloadEndTime = 0;
    this.reloading = false;
    this.burstCount = 0;       // 点射计数
    this.burstResetTime = 0;

    // AI 状态
    this.state = 'idle';
    this.target = null;        // 敌方 Soldier 或 player
    this.lastSeenTargetPos = null;
    this.lastSeenTime = 0;
    this.searchPos = null;
    this.coverPos = null;
    this.thinkTimer = randRange(0.1, 0.4);
    this.fireTimer = 0;
    this.moveTarget = null;
    this.aggression = randRange(0.4, 1.0);  // 个体进攻倾向
    this.accuracy = randRange(0.55, 0.85);  // 命中精度
    this.reactionTime = randRange(0.2, 0.6);

    // 巡逻: 3-5 个路点,到达停留,再换下一个
    this._patrolPoints = [];
    this._patrolIdx = 0;
    this._patrolWaitUntil = 0;

    // 小队
    this.squad = null;
    this.squadOrder = 'free';  // free / advance / hold / follow / patrol

    // 模型
    this.mesh = this._buildModel();
    this.mesh.position.copy(this.position);
    this.headBone = this.mesh.userData.head;
    this.bodyBone = this.mesh.userData.body;
    world.scene.add(this.mesh);

    // 命中盒(用于射线检测): 由 raycast 时根据 mesh 包围盒判断部位
    this.hitboxHead = new THREE.Box3();
    this.hitboxBody = new THREE.Box3();

    this.onDeath = null;
    this.onFire = null;
    this._footstepAcc = 0;
  }

  _buildModel() {
    const g = new THREE.Group();
    const fc = this.faction;

    // ---- 材质 ----
    const uniformMat = new THREE.MeshStandardMaterial({ color: fc.soldierColor, roughness: 0.88 });
    const skinMat    = new THREE.MeshStandardMaterial({ color: fc.skinColor, roughness: 0.7 });
    const helmetMat  = new THREE.MeshStandardMaterial({ color: fc.helmetColor, metalness: 0.35, roughness: 0.55 });
    const bootMat    = new THREE.MeshStandardMaterial({ color: 0x222018, roughness: 0.8 });
    const gunMat     = new THREE.MeshStandardMaterial({ color: 0x1a1814, metalness: 0.5, roughness: 0.45 });
    const equipMat   = new THREE.MeshStandardMaterial({ color: 0x3a3528, roughness: 0.92 });
    const beltMat    = new THREE.MeshStandardMaterial({ color: 0x2a251a, roughness: 0.85 });

    // ---- 躯干: 胸 + 腹(梯形比例) ----
    const torso = new THREE.Group();
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.36, 0.3), uniformMat);
    chest.position.y = 1.34;
    const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.26), uniformMat);
    abdomen.position.y = 1.04;
    // 肩膀
    const shoulderGeo = new THREE.SphereGeometry(0.12, 10, 8);
    const shoulderL = new THREE.Mesh(shoulderGeo, uniformMat); shoulderL.position.set(-0.3, 1.46, 0);
    const shoulderR = new THREE.Mesh(shoulderGeo, uniformMat); shoulderR.position.set( 0.3, 1.46, 0);
    // 腰带
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 14), beltMat);
    belt.position.y = 0.92;
    // 背包
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.2), equipMat);
    pack.position.set(0, 1.2, 0.22);
    // 胸前弹药袋
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), equipMat);
    pouch.position.set(-0.12, 1.3, 0.16);
    torso.add(chest, abdomen, shoulderL, shoulderR, belt, pack, pouch);

    // ---- 头部: 椭圆头 + 鼻子 ----
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), skinMat);
    head.scale.set(0.92, 1.05, 1.0);
    head.position.y = 1.63;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), skinMat);
    nose.position.set(0, 1.615, 0.125);

    // ---- 头盔: 钢盔 + 帽檐 ----
    const helmet = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI*2, 0, Math.PI*0.55),
      helmetMat
    );
    dome.position.y = 1.63;
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 20), helmetMat);
    brim.position.y = 1.63; brim.rotation.x = Math.PI/2; brim.scale.set(1.05, 1.05, 0.75);
    helmet.add(dome, brim);

    // ---- 四肢: CapsuleGeometry(圆柱+圆顶,比方块真实) ----
    const legGeo = new THREE.CapsuleGeometry(0.075, 0.46, 4, 8);
    const armGeo = new THREE.CapsuleGeometry(0.055, 0.36, 4, 8);
    const legL = new THREE.Mesh(legGeo, uniformMat); legL.position.set(-0.13, 0.43, 0);
    const legR = new THREE.Mesh(legGeo, uniformMat); legR.position.set( 0.13, 0.43, 0);
    const armL = new THREE.Mesh(armGeo, uniformMat); armL.position.set(-0.32, 1.2, 0);
    const armR = new THREE.Mesh(armGeo, uniformMat); armR.position.set( 0.32, 1.2, 0);
    // 靴子
    const bootGeo = new THREE.BoxGeometry(0.13, 0.1, 0.24);
    const bootL = new THREE.Mesh(bootGeo, bootMat); bootL.position.set(-0.13, 0.07, 0.03);
    const bootR = new THREE.Mesh(bootGeo, bootMat); bootR.position.set( 0.13, 0.07, 0.03);

    // ---- 步枪(右手前方持枪) ----
    const gun = new THREE.Group();
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.5), gunMat);
    gunBody.position.z = 0.05;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.35, 8), gunMat);
    barrel.rotation.x = Math.PI/2; barrel.position.set(0, 0.02, 0.42);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.07), gunMat);
    mag.position.set(0, -0.1, 0.0);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.18), gunMat);
    stock.position.set(0, -0.03, -0.28);
    gun.add(gunBody, barrel, mag, stock);
    gun.position.set(0.3, 1.12, 0.22);

    g.add(torso, head, nose, helmet, legL, legR, bootL, bootR, armL, armR, gun);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // userData 保留动画骨骼引用(兼容 _updateModel)
    g.userData = { head, torso, legL, legR, armL, armR, gun };
    return g;
  }

  setEnemyTeam(enemies) { this._enemies = enemies; }

  // ========== 受伤 ==========
  takeDamage(amount, dir, headshot, attacker) {
    if (!this.alive) return false;
    this.health -= amount;
    // 受击警觉
    if (attacker && this.health > 0) {
      this.target = attacker;
      this.lastSeenTargetPos = attacker.position.clone();
      this.lastSeenTime = performance.now()/1000;
      if (this.state === 'idle' || this.state === 'advance' || this.state === 'patrol') {
        this.state = 'engage';
      }
    }
    if (this.health <= 0) {
      this.health = 0;     // 夹住, 防止多次扣血/多次扣票
      this.die(dir);
      return true;
    }
    return false;
  }

  die(dir) {
    if (!this.alive) return;
    this.alive = false;
    this.deathTime = performance.now() / 1000;
    // 布娃娃简化: 随机翻倒
    const fallDir = dir ? dir.clone() : new THREE.Vector3(randRange(-1,1),0,randRange(-1,1));
    this._fallDir = fallDir;
    if (this.onDeath) this.onDeath(this);
  }

  // ========== AI 主更新 ==========
  update(dt) {
    if (!this.alive) { this._updateRagdoll(dt); return; }
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) { this._think(); this.thinkTimer = randRange(0.15, 0.4); }

    this._updateCombat(dt);
    this._updateMovement(dt);
    this._updateModel(dt);
    this._updateHitbox();
  }

  _think() {
    // 寻找目标
    const enemy = this._findEnemy();
    if (enemy) {
      this.target = enemy;
      this.lastSeenTargetPos = enemy.position.clone();
      this.lastSeenTime = performance.now()/1000;
    }

    const now = performance.now()/1000;
    const hasTarget = this.target && this.target.alive !== false;
    const seeNow = hasTarget && this._canSee(this.target);
    const sinceSeen = now - this.lastSeenTime;

    if (seeNow) {
      // 决策: 攻击 / 躲掩体 / 包抄
      const hpRatio = this.health / this.maxHealth;
      if (hpRatio < 0.35 && Math.random() < 0.05) {
        this.state = 'cover';
        this.coverPos = this._findCoverFrom(this.target.position);
      } else if (Math.random() < 0.15 * this.aggression && this._distTo(this.target) > 25) {
        this.state = 'flank';
        this.moveTarget = this._flankPos(this.target.position);
      } else {
        this.state = 'engage';
      }
      return;
    }

    // 目标丢失: 搜索最近目击点
    if (hasTarget && sinceSeen < 6) {
      this.state = 'search';
      if (!this.moveTarget || this.position.distanceTo(this.moveTarget) < 3) {
        this.moveTarget = this.lastSeenTargetPos
          ? this.lastSeenTargetPos.clone().add(new THREE.Vector3(randRange(-10,10),0,randRange(-10,10)))
          : this.lastSeenTargetPos.clone();
      }
      return;
    }

    // 小队命令优先
    if (this.squadOrder === 'advance' && this.world.objectives) {
      this.state = 'advance';
      if (!this.moveTarget) this.moveTarget = this._objectivePos();
      return;
    }
    if (this.squadOrder === 'hold') {
      this.state = 'hold';
      return;
    }

    // ========== 无目标时: 巡逻 ==========
    // 生成巡逻路点(首次或到达据点后)
    if (this._patrolPoints.length < 2) this._generatePatrol();

    if (this.state !== 'patrol') {
      this.state = 'patrol';
      this._patrolIdx = 0;
      this.moveTarget = this._patrolPoints[0].clone();
    }
  }

  _generatePatrol() {
    // 以当前位置为中心,3-5 个半径 15-35m 的环绕路点
    const count = randRange(3, 5) | 0;
    const base = this.position.clone();
    const pts = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + randRange(-0.3, 0.3);
      const r = randRange(15, 35);
      const x = base.x + Math.cos(ang) * r;
      const z = base.z + Math.sin(ang) * r;
      const y = this.world.getGroundHeight(x, z);
      pts.push(new THREE.Vector3(x, y, z));
    }
    this._patrolPoints = pts;
    this._patrolIdx = 0;
  }

  _findEnemy() {
    if (!this._enemies) return null;
    let best = null, bestD = Infinity;
    const viewRange = 90;
    for (const e of this._enemies) {
      if (!e.alive) continue;
      const d = this.position.distanceTo(e.position);
      if (d > viewRange) continue;
      if (!this._canSee(e)) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  _canSee(other) {
    // FOV + 视线检测
    const to = other.position.clone().sub(this.position);
    const dist = to.length();
    if (dist > 90) return false;
    to.normalize();
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    // FOV 约 120 度: dot < -0.5 表示夹角 > 120 度(身后)
    if (fwd.dot(to) < -0.5 && dist > 6) return false;  // 身后且不近 -> 看不到
    // 视线射线(排除自己)
    const eye = this.position.clone(); eye.y += 1.6;
    const targetEye = other.position.clone(); targetEye.y += 1.4;
    const dir = targetEye.clone().sub(eye);
    const hit = this.world.raycast(eye, dir.clone().normalize(), dir.length(), this);
    // 命中目标或没命中实体障碍 → 看得见
    if (hit && hit.soldier !== other && !hit.object?.userData?.penetrable) return false;
    return true;
  }

  _findCoverFrom(threatPos) {
    // 寻找附近障碍物作为掩体
    if (!this.world.coverPoints) return null;
    let best = null, bestScore = -Infinity;
    for (const c of this.world.coverPoints) {
      const toThreat = threatPos.clone().sub(c).normalize();
      // 掩体应在威胁与我之间, 且背离威胁方向
      const score = (this.position.distanceTo(c) < 20 ? 1 : 0) * (1 / (0.5 + c.distanceTo(threatPos)));
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  _flankPos(targetPos) {
    // 侧翼位置: 目标侧方 15-25 米
    const ang = randPick([-1, 1]) * randRange(1.0, 1.6);
    const dx = Math.cos(ang) * 20;
    const dz = Math.sin(ang) * 20;
    return new THREE.Vector3(targetPos.x + dx, 0, targetPos.z + dz);
  }

  _objectivePos() {
    // 最近的未占领据点
    if (!this.world.objectives) return this.position.clone();
    let best = null, bestD = Infinity;
    for (const obj of this.world.objectives) {
      if (obj.holder === this.team) continue;
      const d = this.position.distanceTo(new THREE.Vector3(...obj.position));
      if (d < bestD) { bestD = d; best = obj; }
    }
    return best ? new THREE.Vector3(...best.position) : this.position.clone();
  }

  _distTo(t) { return this.position.distanceTo(t.position); }

  // ========== 战斗 ==========
  _updateCombat(dt) {
    if (!this.target || !this.target.alive) { this.target = null; return; }
    const d = this._distTo(this.target);
    const see = this._canSee(this.target);

    // 朝向目标(身体水平)
    const to = this.target.position.clone().sub(this.position);
    this.targetYaw = Math.atan2(-to.x, -to.z);

    if (this.reloading) {
      if (performance.now()/1000 >= this.reloadEndTime) this._finishReload();
      return;
    }

    // 换弹判断(战斗中弹匣<2 就换,以免打一半卡壳)
    if (this.ammoMag <= 0 && this.ammoReserve > 0) { this._startReload(); return; }
    if (see && this.ammoMag < Math.max(2, Math.floor(this.weapon.magSize * 0.15))
      && this.ammoReserve > 0 && d > this.weapon.range * 0.5) {
      // 远距离且子弹少,躲一下换弹
      this._startReload(); return;
    }

    if (see && d < this.weapon.range) {
      // 开火前: 首发反应延迟(人不是机器)
      const now = performance.now()/1000;
      if (!this._aimReadyAt || this._aimReadyTarget !== this.target) {
        this._aimReadyAt = now + this.reactionTime + randRange(0, 0.25);
        this._aimReadyTarget = this.target;
      }
      if (now >= this._aimReadyAt) {
        this._tryFire(dt, d);
      }
    } else {
      // 看不到目标,重置瞄准反应
      this._aimReadyAt = 0;
      this._aimReadyTarget = null;
    }
  }

  _tryFire(dt, dist) {
    const now = performance.now() / 1000;
    const w = this.weapon;

    // ---- 枪型节奏 ----
    let interval;
    if (w.auto) {
      interval = 60 / w.fireRate;
    } else if (w.type === 'sniper') {
      interval = 1.5;  // 栓动狙击:慢
    } else if (w.type === 'rifle') {
      interval = 1.1;  // 栓动步枪
    } else if (w.type === 'semi') {
      interval = 0.22; // 半自动(加兰德/G43)
    } else if (w.type === 'pistol') {
      interval = 0.28;
    } else {
      interval = 0.3;
    }

    // 自动武器: 3-5 发点射 + 停顿
    if (w.auto) {
      if (!this._burstLen) this._burstLen = randRange(3, 5) | 0;
      if (this.burstCount >= this._burstLen) {
        if (now - this.burstResetTime > randRange(0.45, 0.85)) {
          this.burstCount = 0;
          this._burstLen = randRange(3, 5) | 0;
        } else return;
      }
    }
    // 栓动/狙击: 拉栓后才能下一发(用 interval 兜底)

    if (now - this.lastShotTime < interval) return;
    if (this.ammoMag <= 0) return;

    this.lastShotTime = now;
    this.ammoMag--;
    this.burstCount++;
    this.burstResetTime = now;
    // 开火瞬间停步(稳定命中率)
    this._holdFireUntil = now + 0.18;

    // ---- 精度: 距离衰减 + 移动惩罚 + 蹲姿增益 ----
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    const movingPen = 1.0 - Math.min(sp / 5.0, 0.55);
    const rangeRatio = clamp(dist / w.range, 0, 1);
    const baseHit = this.accuracy * (1 - rangeRatio * 0.7) * movingPen;
    // 狙击/长射程枪在远距离额外加成
    const sniperBonus = (w.type === 'sniper' && dist > 200) ? 1.25 : 1.0;
    const hitChance = clamp(baseHit * sniperBonus, 0.04, 0.94);

    const targetPos = this.target.position.clone();
    // 偏好部位: 精准值高的瞄头,否则瞄躯干
    const aim = (this.accuracy > 0.78 && Math.random() < 0.35) ? 1.62 : 1.4;
    targetPos.y += aim + randRange(-0.05, 0.05);

    const origin = this.position.clone(); origin.y += 1.5;
    const dir = targetPos.clone().sub(origin).normalize();
    // 散布
    const spread = 0.012 + (1 - hitChance) * 0.085;
    dir.x += randRange(-spread, spread);
    dir.y += randRange(-spread, spread) * 0.8;
    dir.z += randRange(-spread, spread);
    dir.normalize();

    // 实际射线(排除自己)
    const hit = this.world.raycast(origin, dir, Math.min(w.range, 500), this);
    if (hit) {
      if (hit.soldier && hit.soldier.team !== this.team && hit.soldier !== this) {
        const headshot = hit.headshot;
        const dmg = w.damage * (headshot ? 2.2 : (hit.limb ? 0.65 : 1));
        const killed = hit.soldier.takeDamage(dmg, dir, headshot, this);
        if (this.onFire) this.onFire('hit', hit.soldier, killed);
        if (killed && this.onKill) this.onKill(hit.soldier, this);
      }
      this._muzzleFlash();
      if (this.audio) this.audio.gunshot(this.position, 0.7, w.type === 'sniper' ? 'sniper' : w.type);
      if (this.world.spawnTracer) this.world.spawnTracer(origin, hit.point);
    } else {
      this._muzzleFlash();
      if (this.audio) this.audio.gunshot(this.position, 0.6, w.type === 'sniper' ? 'sniper' : w.type);
      const end = origin.clone().addScaledVector(dir, Math.min(w.range, 400));
      if (this.world.spawnTracer) this.world.spawnTracer(origin, end);
      if (this.onFire) this.onFire('miss', this.target, false);
    }

    // 人声(开火喊话)
    if (Math.random() < 0.08 && this.audio) {
      this.audio.voice(this.position, this.faction.language, this.faction.voicePitch);
    }
  }

  _muzzleFlash() {
    if (!this._flash) {
      const mat = new THREE.SpriteMaterial({ color: 0xffd070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      this._flash = new THREE.Sprite(mat);
      this._flash.scale.set(0.5,0.5,0.5);
      this.mesh.add(this._flash);
      this._flash.position.set(0.3, 1.4, -0.4);
      this._flashLight = new THREE.PointLight(0xffaa44, 0, 6, 2);
      this._flashLight.position.copy(this._flash.position);
      this.mesh.add(this._flashLight);
    }
    this._flash.visible = true; this._flash.material.opacity = 1;
    this._flashLight.intensity = 3;
    this._flashFade = 0.06;
  }

  _startReload() {
    this.reloading = true;
    this.reloadEndTime = performance.now()/1000 + this.weapon.reloadTime;
    if (this.audio) this.audio.reload();
  }
  _finishReload() {
    const need = this.weapon.magSize - this.ammoMag;
    const take = Math.min(need, this.ammoReserve);
    this.ammoMag += take; this.ammoReserve -= take;
    this.reloading = false;
  }

  // ========== 移动 ==========
  _updateMovement(dt) {
    const now = performance.now() / 1000;
    let target = null;
    let speedState = this.state;

    if (this.state === 'engage' || this.state === 'hold') {
      // 战斗/防守时停(除非有 coverPos 要去)
      target = this.coverPos;
      if (!target) {
        // 完全不移动,慢慢停
        this.velocity.x = damp(this.velocity.x, 0, 14, dt);
        this.velocity.z = damp(this.velocity.z, 0, 14, dt);
        this._moving = false;
        this._applyPostMovement(dt);
        return;
      }
      if (this.position.distanceTo(this.coverPos) < 2) {
        this.state = 'engage'; this.coverPos = null;
        target = null;
      }
    } else if (this.state === 'cover' && this.coverPos) {
      target = this.coverPos;
      if (this.position.distanceTo(this.coverPos) < 2) {
        this.state = 'engage'; this.coverPos = null;
      }
    } else if (this.state === 'flank' && this.moveTarget) {
      target = this.moveTarget;
      if (this.position.distanceTo(target) < 3) { this.state = 'engage'; this.moveTarget = null; }
    } else if (this.state === 'advance' || this.state === 'search') {
      target = this.moveTarget;
      if (target && this.position.distanceTo(target) < 4) {
        this.moveTarget = this.state === 'search'
          ? (this.lastSeenTargetPos
              ? this.lastSeenTargetPos.clone().add(new THREE.Vector3(randRange(-6,6),0,randRange(-6,6)))
              : this._objectivePos())
          : this._objectivePos();
      }
    } else if (this.state === 'patrol') {
      // 巡逻: 到达当前路点后停留 1.5-4 秒,再切下一个
      const cur = this._patrolPoints[this._patrolIdx];
      target = cur;
      if (cur && this.position.distanceTo(cur) < 2.5) {
        if (now >= this._patrolWaitUntil) {
          this._patrolIdx = (this._patrolIdx + 1) % this._patrolPoints.length;
          this._patrolWaitUntil = now + randRange(1.5, 4.0);
          // 偶尔重新生成路点(每绕完一圈概率重抽)
          if (this._patrolIdx === 0 && Math.random() < 0.5) {
            this._generatePatrol();
          }
        }
      }
      // 停留中不移动(仍保持巡逻状态,以便 think 看到敌人立刻打断)
      if (now < this._patrolWaitUntil && cur && this.position.distanceTo(cur) < 3) {
        this.velocity.x = damp(this.velocity.x, 0, 12, dt);
        this.velocity.z = damp(this.velocity.z, 0, 12, dt);
        this._moving = false;
        // 停留时随机扭头观察
        if (Math.random() < 0.01) {
          this.targetYaw = this.yaw + randRange(-1.0, 1.0);
        }
        this._applyPostMovement(dt);
        return;
      }
    }

    // ---- 开火瞬间强制停步 0.18s(稳定命中率) ----
    if (this._holdFireUntil && now < this._holdFireUntil) {
      this.velocity.x = damp(this.velocity.x, 0, 20, dt);
      this.velocity.z = damp(this.velocity.z, 0, 20, dt);
      this._moving = false;
      this._applyPostMovement(dt);
      return;
    }

    this._moving = false;
    if (target) {
      const to = target.clone().sub(this.position); to.y = 0;
      const d = to.length();
      if (d > 0.5) {
        to.normalize();
        let speed = 3.0;
        if (speedState === 'flank' || speedState === 'advance') speed = 4.5;
        else if (speedState === 'search') speed = 3.8;
        else if (speedState === 'patrol') speed = 2.6;
        else if (speedState === 'cover') speed = 4.2;
        this.velocity.x = damp(this.velocity.x, to.x * speed, 8, dt);
        this.velocity.z = damp(this.velocity.z, to.z * speed, 8, dt);
        // 战斗中移动不会乱晃身体朝向
        if (speedState !== 'engage' && speedState !== 'hold') {
          this.targetYaw = Math.atan2(-to.x, -to.z);
        }
        this._moving = true;
      } else {
        this.velocity.x = damp(this.velocity.x, 0, 10, dt);
        this.velocity.z = damp(this.velocity.z, 0, 10, dt);
      }
    } else {
      this.velocity.x = damp(this.velocity.x, 0, 10, dt);
      this.velocity.z = damp(this.velocity.z, 0, 10, dt);
    }

    this._applyPostMovement(dt);
  }

  _applyPostMovement(dt) {
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // ⚠️ 先碰撞! 必须在 getGroundHeight 之前, 否则水面/边界推回后 y 错位
    if (this.world.collideSoldier) this.world.collideSoldier(this.position, STAND_H);

    // 地形跟随 (用碰撞修正后的坐标)
    const g = this.world.getGroundHeight(this.position.x, this.position.z);
    this.position.y = damp(this.position.y, g, 18, dt);

    // 朝向平滑
    this.yaw = smoothAngle(this.yaw, this.targetYaw, 1 - Math.exp(-8 * dt));

    // 脚步
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    if (sp > 0.5) {
      this._footstepAcc += sp * dt;
      if (this._footstepAcc > 2.0) {
        this._footstepAcc = 0;
        if (this.audio) this.audio.footstep(this.position);
      }
    }
  }

  // ========== 模型动画 ==========
  _updateModel(dt) {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    // 走动摆腿
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    const u = this.mesh.userData;
    if (sp > 0.5) {
      this._walkPhase = (this._walkPhase || 0) + sp * dt * 3;
      u.legL.rotation.x = Math.sin(this._walkPhase) * 0.7;
      u.legR.rotation.x = -Math.sin(this._walkPhase) * 0.7;
      u.armL.rotation.x = -Math.sin(this._walkPhase) * 0.5;
      u.armR.rotation.x = Math.sin(this._walkPhase) * 0.5;
    } else {
      u.legL.rotation.x = damp(u.legL.rotation.x, 0, 10, dt);
      u.legR.rotation.x = damp(u.legR.rotation.x, 0, 10, dt);
      u.armL.rotation.x = damp(u.armL.rotation.x, -0.3, 10, dt); // 持枪
      u.armR.rotation.x = damp(u.armR.rotation.x, -0.4, 10, dt);
    }
    // 枪口闪光衰减
    if (this._flash && this._flash.visible) {
      this._flash.material.opacity = damp(this._flash.material.opacity, 0, 30, dt);
      this._flashLight.intensity = damp(this._flashLight.intensity, 0, 30, dt);
      if (this._flashLight.intensity < 0.05) this._flash.visible = false;
    }
  }

  _updateHitbox() {
    // 头部命中盒(小球)
    this.hitboxHead.setFromCenterAndSize(
      new THREE.Vector3(this.position.x, this.position.y + 1.62, this.position.z),
      new THREE.Vector3(0.32, 0.36, 0.32)
    );
    // 身体命中盒
    this.hitboxBody.setFromCenterAndSize(
      new THREE.Vector3(this.position.x, this.position.y + 1.05, this.position.z),
      new THREE.Vector3(0.6, 1.2, 0.4)
    );
  }

  // 射线与命中盒检测 -> { headshot, limb }
  hitTest(origin, dir, maxDist) {
    // 先检测头部
    const ray = new THREE.Ray(origin, dir);
    const box = new THREE.Box3();
    // 头部
    const headHit = ray.intersectBox(this.hitboxHead, new THREE.Vector3());
    if (headHit && origin.distanceTo(headHit) <= maxDist) {
      return { point: headHit, headshot: true, normal: new THREE.Vector3(0,1,0) };
    }
    // 身体
    const bodyHit = ray.intersectBox(this.hitboxBody, new THREE.Vector3());
    if (bodyHit && origin.distanceTo(bodyHit) <= maxDist) {
      // 下半身为 limb
      const limb = bodyHit.y < this.position.y + 0.7;
      return { point: bodyHit, headshot: false, limb, normal: new THREE.Vector3(0,1,0) };
    }
    return null;
  }

  _updateRagdoll(dt) {
    // 倒地动画: 倾倒 + 下沉
    const t = performance.now()/1000 - this.deathTime;
    const fall = clamp(t * 2.5, 0, Math.PI / 2);
    const axis = new THREE.Vector3(this._fallDir?.x || 0, 0, this._fallDir?.z || 1).normalize();
    this.mesh.rotation.set(0, this.yaw, 0);
    // 用 quaternion 绕轴倾倒
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(axis.z, 0, -axis.x), fall
    );
    this.mesh.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0)));
    // 5 秒后下沉消失
    if (t > 8) {
      this.mesh.position.y = damp(this.mesh.position.y, -2, 1, dt);
      if (t > 12 && this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
        this._removed = true;
      }
    }
  }

  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.mesh.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose && o.material.dispose();
    });
  }
}


