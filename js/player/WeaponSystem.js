// js/player/WeaponSystem.js
// 武器系统: 持有/切换/开火/换弹/弹道/后坐力/枪口火焰/弹壳/射线检测
// 弹道: 采用飞行时间 + 射线分段检测(性能与真实兼顾)
//   - 开火时计算初速方向(含散布), 用射线推进, 每步检测命中
//   - 重力下坠影响方向, 飞行时间到达目标距离即结算伤害

import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';
import { clamp, randRange, damp } from '../utils/MathUtils.js';
import { createWeaponModel } from './WeaponFactory.js';
import { log } from '../utils/logger.js';
const L = log('Weapon');

const MAX_BULLET_DIST = 800;
const BULLET_STEP = 4;        // 射线分段步长(米)
const TRACER_LIFE = 0.08;

export class WeaponSystem {
  constructor(player, scene, world, audio, hud) {
    this.player = player;
    this.scene = scene;
    this.world = world;       // 提供 raycast(origin,dir,maxDist) -> {point, object, soldier, headshot}
    this.audio = audio;
    this.hud = hud;

    this.loadout = [];        // 武器槽位: [primary, secondary, grenade]
    this.currentSlot = 0;
    this.current = null;      // 当前武器数据
    this.ammoState = new Map(); // weaponId -> { mag, reserve }

    // 射击状态
    this.lastShotTime = 0;
    this.fireCooldown = 0;
    this.reloading = false;
    this.reloadEndTime = 0;
    this.semiLatch = false;   // 半自动/栓动 一发松开才能下一发
    this.recoil = { v: 0, h: 0 };   // 累积后坐力(施加到视角)

    // 视图模型
    this.viewmodelAnchor = player.getWeaponAnchor();
    this.currentModel = null;
    this.muzzlePos = new THREE.Object3D(); // 枪口位置节点
    this.muzzleFlash = null;
    this.muzzleLight = null;

    // 弹道效果池
    this.tracers = [];
    this.impacts = [];

    this.onShoot = null;      // 外部回调(用于 AI 警觉)
    this.onKill = null;
    this.onHit = null;

    this._setupMuzzleFx();
  }

  _setupMuzzleFx() {
    // 枪口闪光(精灵)
    const tex = this._makeFlashTexture();
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffd070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.muzzleFlash = new THREE.Sprite(mat);
    this.muzzleFlash.scale.set(0.4, 0.4, 0.4);
    this.muzzleFlash.visible = false;
    this.viewmodelAnchor.add(this.muzzleFlash);
    this.muzzleFlash.position.set(0.6, 0, 0);

    // 枪口点光源
    this.muzzleLight = new THREE.PointLight(0xffaa44, 0, 8, 2);
    this.muzzleLight.position.set(0.6, 0, 0);
    this.viewmodelAnchor.add(this.muzzleLight);
  }

  _makeFlashTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,220,1)');
    grad.addColorStop(0.3, 'rgba(255,200,80,0.8)');
    grad.addColorStop(1, 'rgba(255,100,0,0)');
    g.fillStyle = grad; g.fillRect(0,0,64,64);
    const t = new THREE.CanvasTexture(c); return t;
  }

  // ========== 装备 ==========
  setLoadout(primaryId, secondaryId, grenadeId) {
    this.loadout = [WEAPONS[primaryId], WEAPONS[secondaryId], WEAPONS[grenadeId]].filter(Boolean);
    // 初始化弹药
    this.ammoState.clear();
    this.loadout.forEach(w => {
      this.ammoState.set(w.id, { mag: w.magSize, reserve: w.reserve });
    });
    this.switchTo(0);
  }

  switchTo(slot) {
    if (slot < 0 || slot >= this.loadout.length) return;
    if (this.reloading) return;
    this.currentSlot = slot;
    this.current = this.loadout[slot];
    this.semiLatch = false;
    this.player.setWeaponZoom(this.current.zoom || 1.6);
    this._updateViewmodel();
    L.info('switch to ' + this.current.type + ' (' + this.current.id + ')');
    if (this.hud) this.hud.updateWeapon(this.current, this.getAmmo());
  }

  getAmmo() { return this.ammoState.get(this.current.id) || { mag: 0, reserve: 0 }; }

  _updateViewmodel() {
    if (this.currentModel) {
      this.viewmodelAnchor.remove(this.currentModel);
      this.currentModel.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    this.currentModel = createWeaponModel(this.current);
    this.viewmodelAnchor.add(this.currentModel);
    // 手枪/手雷放低
    if (this.current.type === 'pistol' || this.current.type === 'grenade') {
      this.currentModel.position.y = -0.05;
    }
  }

  // ========== 主更新 ==========
  update(dt) {
    const input = this.player.input;

    // 切换武器(数字键 / 滚轮)
    const num = input.numberPressed();
    if (num >= 1 && num <= this.loadout.length) this.switchTo(num - 1);
    if (input.wheelDelta !== 0 && !this.reloading) {
      const dir = input.wheelDelta > 0 ? 1 : -1;
      this.switchTo((this.currentSlot + dir + this.loadout.length) % this.loadout.length);
    }

    // 换弹
    if (input.justPressed('KeyR')) this.startReload();

    // 手雷投掷
    if (this.current.type === 'grenade' || this.current.type === 'rocket') {
      if (input.mousePressed[0]) this.fireSpecial();
    } else {
      // 普通开火
      this._handleFire(dt);
    }

    // 后坐力恢复(手雷/火箭无 recoil 字段,兜底默认值)
    const rec = this.current.recoil || { recover: 6 };
    this.recoil.v = damp(this.recoil.v, 0, rec.recover || 6, dt);
    this.recoil.h = damp(this.recoil.h, 0, rec.recover || 6, dt);
    // 把后坐力施加到玩家视角(在玩家 update 之后)
    this.player.pitch += this.recoil.v * dt * 0.0;  // 后坐力直接作用已在 fire 中处理
    this.player.yaw   += this.recoil.h * dt * 0.0;

    // 完成换弹
    if (this.reloading && performance.now() / 1000 >= this.reloadEndTime) this._finishReload();

    // 枪口闪光衰减
    if (this.muzzleFlash.visible) {
      this.muzzleFlash.material.opacity = damp(this.muzzleFlash.material.opacity, 0, 30, dt);
      this.muzzleLight.intensity = damp(this.muzzleLight.intensity, 0, 30, dt);
      if (this.muzzleLight.intensity < 0.05) this.muzzleFlash.visible = false;
    }

    // 弹道粒子更新
    this._updateEffects(dt);
  }

  _handleFire(dt) {
    const now = performance.now() / 1000;
    const w = this.current;
    const input = this.player.input;
    const wantFire = input.mouseButtons[0];

    // 冷却
    if (now - this.lastShotTime < this.fireCooldown) return;
    if (this.reloading) return;

    const ammo = this.getAmmo();
    if (ammo.mag <= 0) {
      // 自动换弹
      if (wantFire) this.startReload();
      return;
    }

    // 全自动: 持续按住可连发; 半自动/栓动: 一发松开才能下一发
    if (w.auto) {
      if (!wantFire) return;
    } else {
      if (!input.mousePressed[0] && !this.semiLatch) {
        // 需要本次按下
      }
      if (!wantFire) { this.semiLatch = false; return; }
      if (this.semiLatch) return;
      this.semiLatch = true;
    }

    // 开火
    this._fire(now);
  }

  _fire(now) {
    const w = this.current;
    const ammo = this.getAmmo();
    L.debug('fire type=' + w.type + ' mag=' + (ammo.mag - 1) + '/' + w.magSize);
    ammo.mag--;
    this.lastShotTime = now;
    this.fireCooldown = w.auto ? (60 / w.fireRate) : (w.type === 'rifle' || w.type === 'sniper' ? 0.9 : 0.12);

    // 散布
    const spread = this.player.isADS ? w.adsSpread : w.spread;
    const spreadMul = this.player.isSprinting ? 3 : (Math.hypot(this.player.velocity.x, this.player.velocity.z) > 1 ? 1.6 : 1);
    const s = spread * spreadMul;

    // 方向: 摄像机朝向 + 散布
    const dir = new THREE.Vector3();
    this.player.camera.getWorldDirection(dir);
    // 添加散布
    dir.x += randRange(-s, s); dir.y += randRange(-s, s); dir.z += randRange(-s, s);
    dir.normalize();

    const origin = this.player.camera.getWorldPosition(new THREE.Vector3());

    // 弹道射线(分段, 考虑下坠; 排除玩家自己)
    this._castBullet(origin, dir, w, this.player);

    // 后坐力(施加到玩家视角)
    this.recoil.v += w.recoil.v;
    this.recoil.h += randRange(-w.recoil.h, w.recoil.h);
    this.player.pitch += w.recoil.v * 0.5;
    this.player.yaw   += randRange(-w.recoil.h, w.recoil.h) * 0.5;
    // 后坐力上抬视角恢复由玩家 update 的 damp 处理(此处施加瞬时)

    // 视图模型后坐力(枪回退动画)
    if (this.currentModel) {
      this.currentModel.position.z = 0.06;
      this._vmRecoilTime = 0;
    }

    // 枪口闪光
    this.muzzleFlash.visible = true;
    this.muzzleFlash.material.opacity = 1;
    this.muzzleFlash.material.rotation = Math.random() * Math.PI;
    this.muzzleLight.intensity = 4;

    // 音效
    const gunType = (w.type === 'sniper') ? 'sniper' : w.type;
    if (this.audio) this.audio.gunshot(this.player.position, 1, gunType);

    // 弹壳(简单粒子)
    this._spawnShell(origin, dir);

    // HUD 更新
    if (this.hud) this.hud.updateAmmo(this.getAmmo());

    // 外部回调
    if (this.onShoot) this.onShoot(origin, dir, w);
  }

  _castBullet(origin, dir, w, excludeShooter = null) {
    // 分段推进, 每步检查碰撞
    let pos = origin.clone();
    let vel = dir.clone().multiplyScalar(w.bulletSpeed);
    const g = w.bulletDrop;
    let dist = 0;
    let prev = pos.clone();
    const stepDt = BULLET_STEP / w.bulletSpeed;

    while (dist < Math.min(w.range, MAX_BULLET_DIST)) {
      prev.copy(pos);
      // 应用重力(下坠)
      vel.y -= g * stepDt;
      pos.addScaledVector(vel, stepDt);
      dist += BULLET_STEP;

      const segDir = pos.clone().sub(prev);
      const segLen = segDir.length();
      segDir.normalize();

      // 射线检测(排除开枪者自己)
      const hit = this.world.raycast(prev, segDir, segLen, excludeShooter);
      if (hit) {
        // 命中
        this._onBulletHit(hit, w, segDir);
        this._spawnTracer(origin, hit.point);
        this._spawnImpact(hit.point, hit.normal);
        return;
      }
    }
    // 未命中, 显示飞向远处的曳光
    const endPoint = origin.clone().addScaledVector(dir, Math.min(w.range, MAX_BULLET_DIST));
    this._spawnTracer(origin, endPoint);
  }

  _onBulletHit(hit, weapon, dir) {
    if (hit.soldier) {
      // 命中士兵
      const dmg = weapon.damage * (hit.headshot ? 2.2 : (hit.limb ? 0.7 : 1));
      const killed = hit.soldier.takeDamage(dmg, dir, hit.headshot, this.player);
      if (this.audio) this.audio.hitMarker();
      if (this.hud) this.hud.showHitMarker(hit.headshot);
      if (this.onHit) this.onHit(hit.soldier, hit.headshot);
      if (killed && this.onKill) this.onKill(hit.soldier, this.player, weapon);
    } else if (this.player.isADS && this.hud) {
      // 击中环境(无标记)
    }
  }

  // ========== 手雷/火箭 ==========
  fireSpecial() {
    if (this._specialLatch) return;
    const w = this.current;
    const ammo = this.getAmmo();
    if (ammo.mag <= 0) return;
    ammo.mag--;
    this._specialLatch = true;
    if (this.hud) this.hud.updateAmmo(this.getAmmo());

    const origin = this.player.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3();
    this.player.camera.getWorldDirection(dir);

    if (w.type === 'grenade') {
      this.world.spawnGrenade(origin.clone(), dir.clone(), w);
      if (this.audio) this.audio.voice(this.player.position, 'throw');
    } else if (w.type === 'rocket') {
      this.world.spawnRocket(origin.clone(), dir.clone(), w, this.player);
      if (this.audio) this.audio.gunshot(this.player.position, 1.5, 'sniper');
    }
    // 投掷动画
    if (this.currentModel) {
      this.currentModel.position.y = -0.3;
      this._specialThrowTime = 0;
    }
    setTimeout(() => { this._specialLatch = false; }, 600);
  }

  // ========== 换弹 ==========
  startReload() {
    if (this.reloading) return;
    const w = this.current;
    if (w.type === 'grenade' || w.type === 'rocket') return;
    const ammo = this.getAmmo();
    if (ammo.mag >= w.magSize || ammo.reserve <= 0) return;
    this.reloading = true;
    this.reloadEndTime = performance.now() / 1000 + w.reloadTime;
    if (this.audio) this.audio.reload();
    if (this.hud) this.hud.showReload(true);
  }

  _finishReload() {
    const w = this.current;
    const ammo = this.getAmmo();
    const need = w.magSize - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take; ammo.reserve -= take;
    this.reloading = false;
    L.info('reload ' + w.id + ' finish, mag=' + ammo.mag + ' reserve=' + ammo.reserve);
    if (this.hud) { this.hud.showReload(false); this.hud.updateAmmo(ammo); }
  }

  // ========== 效果 ==========
  _spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: TRACER_LIFE });
  }

  _spawnImpact(point, normal) {
    // 火花/尘土
    const geo = new THREE.BufferGeometry();
    const N = 8;
    const positions = new Float32Array(N * 3);
    const dir = normal ? normal.clone() : new THREE.Vector3(0,1,0);
    for (let i = 0; i < N; i++) {
      positions[i*3] = point.x; positions[i*3+1] = point.y; positions[i*3+2] = point.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xddaa66, size: 0.12, transparent: true, opacity: 1, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.impacts.push({ pts, life: 0.4, vel: [] });
    for (let i = 0; i < N; i++) {
      this.impacts[this.impacts.length-1].vel.push(new THREE.Vector3(
        dir.x + randRange(-1,1), dir.y + randRange(0,1.5), dir.z + randRange(-1,1)
      ).multiplyScalar(randRange(1,3)));
    }
  }

  _spawnShell(origin, dir) {
    // 简化: 不生成实体弹壳, 仅音效(略)
  }

  _updateEffects(dt) {
    // 曳光衰减
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / TRACER_LIFE) * 0.8;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose(); t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    // 撞击粒子
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const im = this.impacts[i];
      im.life -= dt;
      const pos = im.pts.geometry.attributes.position;
      for (let j = 0; j < im.vel.length; j++) {
        pos.array[j*3]   += im.vel[j].x * dt;
        pos.array[j*3+1] += im.vel[j].y * dt;
        pos.array[j*3+2] += im.vel[j].z * dt;
        im.vel[j].y -= 9.8 * dt;
      }
      pos.needsUpdate = true;
      im.pts.material.opacity = Math.max(0, im.life / 0.4);
      if (im.life <= 0) {
        this.scene.remove(im.pts);
        im.pts.geometry.dispose(); im.pts.material.dispose();
        this.impacts.splice(i, 1);
      }
    }
    // 视图模型后坐力恢复
    if (this.currentModel) {
      this.currentModel.position.z = damp(this.currentModel.position.z, 0, 18, dt);
      this.currentModel.position.y = damp(this.currentModel.position.y,
        (this.current.type === 'pistol' || this.current.type === 'grenade') ? -0.05 : 0, 18, dt);
    }
  }

  isReloading() { return this.reloading; }
}
