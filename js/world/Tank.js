// js/world/Tank.js
// 坦克载具: 可驾驶(玩家) + 自主(AI 模式)
// 玩家驾驶: WASD 移动, 鼠标控制炮塔, 左键开火
// 简化装甲模型: 正面装甲厚(减伤), 侧面/后面薄
// 反坦克武器(铁拳)命中可摧毁

import * as THREE from 'three';
import { FACTIONS } from '../data/factions.js';
import { clamp, damp, smoothAngle, randRange } from '../utils/MathUtils.js';

export class Tank {
  constructor(factionId, position, world, audio) {
    this.faction = FACTIONS[factionId];
    this.team = factionId;
    this.world = world;
    this.audio = audio;
    this.position = position.clone();
    this.position.y = world.getGroundHeight(position.x, position.z);
    this.hullYaw = 0;
    this.turretYaw = 0;
    this.velocity = 0;
    this.health = 800; this.maxHealth = 800;
    this.alive = true;
    this.driver = null;        // 玩家引用
    this.lastFireTime = 0;
    this.fireCooldown = 4.0;   // 主炮冷却
    this.isPlayer = false;     // 坦克本身不是 player
    this.isAI = true;

    this.mesh = this._build();
    this.mesh.position.copy(this.position);
    world.scene.add(this.mesh);

    // 命中盒(用于射线检测)
    this.hitbox = new THREE.Box3();
    this._updateHitbox();
  }

  _build() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: this.faction.soldierColor, metalness: 0.5, roughness: 0.6 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    // 车体
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 5.5), bodyMat);
    hull.position.y = 1.2; g.add(hull);
    // 履带
    const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 5.8), trackMat);
    trackL.position.set(-1.5, 0.6, 0); g.add(trackL);
    const trackR = trackL.clone(); trackR.position.x = 1.5; g.add(trackR);
    // 炮塔(独立旋转组)
    const turret = new THREE.Group();
    turret.position.y = 1.9;
    const turretBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 2.4), bodyMat);
    turret.add(turretBody);
    // 炮管
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 10), darkMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.1, -1.8);
    turret.add(barrel);
    // 炮口
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.1, -3.4); turret.add(muzzle);
    g.add(turret);
    g.userData = { turret, muzzle, hull };

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  enter(player, weapons) {
    this.driver = player;
    this._playerWeapons = weapons;
    // 隐藏玩家视图模型
    player.viewmodel.visible = false;
  }
  exit(player) {
    this.driver = null;
    player.viewmodel.visible = true;
    // 玩家位置移到坦克旁
    player.position.set(this.position.x + 3, this.position.y, this.position.z);
  }
  syncPlayer(player) {
    // 玩家位置同步到炮塔(第一人称视角在炮塔)
    player.position.copy(this.position);
    player.position.y += 2.5;
    // 视角由 input 控制, 直接应用 yaw/pitch 到炮塔
    this.turretYaw = player.yaw;
    this.mesh.userData.turret.rotation.y = this.turretYaw - this.hullYaw;
  }

  update(dt) {
    if (!this.alive) { this._updateDeath(dt); return; }
    if (this.driver) this._updatePlayerControl(dt);
    else this._updateAI(dt);

    // 物理: 位置
    const sin = Math.sin(this.hullYaw), cos = Math.cos(this.hullYaw);
    // 前进方向: (-sin, 0, -cos)
    this.position.x += -sin * this.velocity * dt;
    this.position.z += -cos * this.velocity * dt;

    // ⚠️ 先碰撞! 必须在 getGroundHeight 之前, 否则水面/边界推回后 y 错位
    this.world.collidePlayer(this.position, 3);

    // 地形跟随 (用碰撞修正后的坐标)
    this.position.y = damp(this.position.y, this.world.getGroundHeight(this.position.x, this.position.z), 10, dt);

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.hullYaw;
    this.mesh.userData.turret.rotation.y = this.turretYaw - this.hullYaw;
    this._updateHitbox();

    // 引擎声(简化: 移动时低频)
    if (Math.abs(this.velocity) > 0.5 && Math.random() < 0.02 && this.audio) {
      this.audio.footstep(this.position);
    }
  }

  _updatePlayerControl(dt) {
    const input = this.world.player ? null : null; // player.input via this.driver
    const inp = this.driver.input;
    // 移动
    const accel = 8, maxSpeed = 12;
    let throttle = 0;
    if (inp.isDown('KeyW')) throttle += 1;
    if (inp.isDown('KeyS')) throttle -= 1;
    this.velocity = damp(this.velocity, throttle * maxSpeed, accel, dt);
    // 转向
    let turn = 0;
    if (inp.isDown('KeyA')) turn += 1;
    if (inp.isDown('KeyD')) turn -= 1;
    this.hullYaw = smoothAngle(this.hullYaw, this.hullYaw + turn * 1.2 * dt, 1);

    // 开火(左键)
    const now = performance.now() / 1000;
    if (inp.mouseButtons[0] && now - this.lastFireTime > this.fireCooldown) {
      this._fire();
    }
    // 同步玩家视角到炮塔
    this.turretYaw = this.driver.yaw;
  }

  _updateAI(dt) {
    // 简化 AI: 朝最近敌方推进并开火
    const enemies = this._findEnemies();
    if (enemies.length === 0) {
      this.velocity = damp(this.velocity, 0, 4, dt);
      return;
    }
    const target = enemies[0];
    const to = target.position.clone().sub(this.position);
    const dist = to.length();
    // 朝向
    this.hullYaw = smoothAngle(this.hullYaw, Math.atan2(-to.x, -to.z), 1 - Math.exp(-2*dt));
    this.turretYaw = smoothAngle(this.turretYaw, Math.atan2(-to.x, -to.z), 1 - Math.exp(-4*dt));
    // 移动(保持中距)
    if (dist > 40) this.velocity = damp(this.velocity, 8, 4, dt);
    else if (dist < 25) this.velocity = damp(this.velocity, -4, 4, dt);
    else this.velocity = damp(this.velocity, 0, 4, dt);
    // 开火
    const now = performance.now() / 1000;
    if (now - this.lastFireTime > this.fireCooldown && dist < 120) {
      this._fire(target);
    }
  }

  _findEnemies() {
    const list = [];
    if (this.world.player && this.world.player.alive && this.world.player.team !== this.team) list.push(this.world.player);
    for (const s of this.world.soldiers) {
      if (s.alive && s.team !== this.team) list.push(s);
    }
    for (const t of (this.world.tanks || [])) {
      if (t.alive && t.team !== this.team) list.push(t);
    }
    list.sort((a,b) => this.position.distanceTo(a.position) - this.position.distanceTo(b.position));
    return list;
  }

  _fire(target = null) {
    this.lastFireTime = performance.now() / 1000;
    const muzzle = this.mesh.userData.muzzle;
    const origin = new THREE.Vector3();
    muzzle.getWorldPosition(origin);
    let dir;
    if (this.driver) {
      dir = new THREE.Vector3(); this.driver.camera.getWorldDirection(dir);
    } else if (target) {
      const tp = target.position.clone(); tp.y += 1.5;
      dir = tp.clone().sub(origin).normalize();
      // AI 散布
      dir.x += randRange(-0.04, 0.04); dir.y += randRange(-0.02, 0.02); dir.z += randRange(-0.04, 0.04);
      dir.normalize();
    } else {
      const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(muzzle.getWorldQuaternion(new THREE.Quaternion()));
      dir = fwd;
    }

    // 坦克炮弹(高速直线 + 范围伤害)
    this.world.spawnRocket(origin, dir, {
      id: 'tank_shell', name: '坦克炮弹', type: 'rocket',
      damage: 350, bulletSpeed: 200, radius: 8, magSize: 1, reserve: 99, throwRange: 0, moveSpeed: 1, antiVehicle: true,
    }, this);

    // 视觉: 炮口闪光
    const flash = new THREE.PointLight(0xffaa44, 10, 15, 2);
    flash.position.copy(origin); this.world.scene.add(flash);
    setTimeout(() => this.world.scene.remove(flash), 80);
    if (this.audio) this.audio.explosion(origin, 0.6);
  }

  takeDamage(amount, dir, headshot, attacker) {
    if (!this.alive) return false;
    // 装甲方向判定: 正面减伤
    const toAttacker = attacker ? attacker.position.clone().sub(this.position).normalize() : dir.clone().negate();
    const fwd = new THREE.Vector3(-Math.sin(this.hullYaw), 0, -Math.cos(this.hullYaw));
    const dot = fwd.dot(toAttacker);
    let armorMul = 1;
    if (dot > 0.5) armorMul = 0.3;        // 正面
    else if (dot > -0.3) armorMul = 0.6;  // 侧面
    else armorMul = 1.0;                   // 后面
    const dmg = amount * armorMul;
    this.health -= dmg;
    if (this.health <= 0) {
      this._die();
      return true;
    }
    return false;
  }

  hitTest(origin, dir, maxDist) {
    const ray = new THREE.Ray(origin, dir);
    const hit = ray.intersectBox(this.hitbox, new THREE.Vector3());
    if (hit && origin.distanceTo(hit) <= maxDist) {
      return { point: hit, headshot: false, limb: false, normal: new THREE.Vector3(0,1,0) };
    }
    return null;
  }

  _updateHitbox() {
    this.hitbox.setFromCenterAndSize(
      new THREE.Vector3(this.position.x, this.position.y + 1.5, this.position.z),
      new THREE.Vector3(3.5, 2.5, 6)
    );
  }

  _die() {
    this.alive = false;
    this.deathTime = performance.now() / 1000;
    // 爆炸
    if (this.audio) this.audio.explosion(this.position, 1.5);
    // 驱逐驾驶员
    if (this.driver) { this.exit(this.driver); this.driver.takeDamage(80, this.position); }
    // 黑烟
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._smokeTex(), transparent: true, opacity: 0.9, depthWrite: false, color: 0x222222
    }));
    smoke.scale.set(8,8,1); smoke.position.copy(this.position); smoke.position.y += 3;
    this.world.scene.add(smoke);
    this._smoke = smoke;
  }

  _updateDeath(dt) {
    const t = performance.now()/1000 - this.deathTime;
    if (this._smoke) {
      this._smoke.scale.addScalar(dt * 2);
      this._smoke.material.opacity = Math.max(0, 0.9 - t * 0.05);
    }
    if (t > 20 && this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
      if (this._smoke && this._smoke.parent) this._smoke.parent.remove(this._smoke);
      this._removed = true;
    }
  }

  _smokeTex() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64,64,0,64,64,64);
    grad.addColorStop(0, 'rgba(40,40,40,0.9)');
    grad.addColorStop(1, 'rgba(20,20,20,0)');
    g.fillStyle = grad; g.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
}
