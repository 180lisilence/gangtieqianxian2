// js/player/PlayerController.js
// PUBG 风格玩家控制器:
//   - 第一人称视角 + 持枪视图模型(viewmodel)
//   - 走/冲刺/蹲/卧/探头(QE)/瞄准(右键)/屏息(瞄准时Shift)
//   - 呼吸抖动 / 移动抖动 / 着陆抖动 / 倾斜
//   - 速度分级、惯性、加速度
//   - 地面碰撞(简单胶囊-地形高度), 后续可扩展为场景碰撞

import * as THREE from 'three';
import { clamp, damp, lerp, deg2rad } from '../utils/MathUtils.js';

const STAND_HEIGHT = 1.7;
const CROUCH_HEIGHT = 1.1;
const PRONE_HEIGHT = 0.5;
const EYE_OFFSET = 0.15;     // 眼睛相对胶囊顶部的偏移

const SPEED = {
  walk: 3.2,
  run: 7.0,
  sprint: 9.0,
  crouch: 1.8,
  prone: 0.9,
  ads: 2.4,          // 瞄准时移动
};

// 物理常量
const GRAVITY = 22.0;        // 重力加速度 m/s² (比真实大一点让手感干脆)
const JUMP_VELOCITY = 8.5;   // 起跳速度 m/s

export class PlayerController {
  constructor(camera, scene, input, world) {
    this.camera = camera;
    this.scene = scene;
    this.input = input;
    this.world = world;        // 提供 getGroundHeight(x,z), collide(position)

    // 状态
    this.position = new THREE.Vector3(0, STAND_HEIGHT, 0);
    this.velocity = new THREE.Vector3();
    this.velocity.y = 0;
    this.onGround = true;       // 是否在地面上
    this.yaw = 0;              // 水平朝向(弧度)
    this.pitch = 0;            // 俯仰(弧度)
    this.stance = 'stand';     // stand / crouch / prone
    this.lean = 0;             // -1 左探头, 1 右探头, 0 无
    this.leanTarget = 0;
    this.isADS = false;        // 瞄准
    this.isSprinting = false;
    this.walkMode = 'run';     // 'walk' 走路(3.2) / 'run' 疾跑(9.0), Ctrl 切换
    this.isBreathHeld = false; // 屏息(瞄准时)
    this.aimT = 0;             // 瞄准过渡 0-1
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 100;
    this.maxArmor = 100;
    this.alive = true;

    // 抖动参数
    this.breathPhase = 0;
    this.moveBobPhase = 0;
    this.landShake = 0;
    this.leanRoll = 0;         // 摄像机滚转(度)
    this.fovBase = 75;
    this.fovCurrent = 75;

    // 视图模型容器(挂载武器) —— 位于相机右下方,右手持枪视角
    this.viewmodel = new THREE.Group();
    this.viewmodelHolder = new THREE.Group(); // 用于抖动/后坐力偏移
    this.viewmodel.add(this.viewmodelHolder);
    this.camera.add(this.viewmodel);
    this.viewmodel.position.set(0.32, -0.28, -0.42);

    // 受击红色覆盖(屏幕中心), 通过事件通知 HUD
    this.onDamage = null;
    this.onDeath = null;

    this.sensitivity = 0.0022;
    this.adsSensitivity = 0.0011;
  }

  // 由外部 WeaponSystem 调用以挂载武器模型
  getWeaponAnchor() { return this.viewmodelHolder; }
  getCamera() { return this.camera; }

  reset(pos) {
    this.position.copy(pos);
    this.velocity.set(0,0,0);
    this.yaw = 0; this.pitch = 0;
    this.stance = 'stand'; this.lean = 0; this.leanTarget = 0;
    this.isADS = false; this.aimT = 0;
    this.health = this.maxHealth; this.armor = this.maxArmor;
    this.alive = true;
    this._applyStance(true);
  }

  // ========== 输入处理 ==========
  update(dt) {
    if (!this.alive) return;
    const input = this.input;

    // 视角(鼠标) - 鼠标输入已锁定时
    const sens = this.isADS ? this.adsSensitivity : this.sensitivity;
    this.yaw   -= input.mouseDelta.x * sens;
    this.pitch -= input.mouseDelta.y * sens;
    this.pitch = clamp(this.pitch, -deg2rad(85), deg2rad(85));

    // 探头
    if (input.justPressed('KeyQ')) this.leanTarget = -1;
    else if (input.justPressed('KeyE')) this.leanTarget = 1;
    else if (input.justReleased('KeyQ') && this.leanTarget === -1) this.leanTarget = 0;
    else if (input.justReleased('KeyE') && this.leanTarget === 1) this.leanTarget = 0;

    // 蹲下/卧倒切换
    if (input.justPressed('KeyC')) {
      this.stance = (this.stance === 'crouch') ? 'stand' : 'crouch';
      this._applyStance();
    }
    if (input.justPressed('KeyZ')) {
      this.stance = (this.stance === 'prone') ? 'stand' : 'prone';
      this._applyStance();
    }

    // 跳跃 (仅站立时可跳, 且必须在地面)
    if (input.justPressed('Space') && this.onGround && this.stance === 'stand') {
      this.velocity.y = JUMP_VELOCITY;
      this.onGround = false;
    }

    // 走路/疾跑模式切换 (Ctrl)
    if (input.justPressed('ControlLeft') || input.justPressed('ControlRight')) {
      this.walkMode = (this.walkMode === 'run') ? 'walk' : 'run';
    }

    // 瞄准
    this.isADS = input.mouseButtons[2];
    this.isSprinting = (this.walkMode === 'run') && !this.isADS && this.stance === 'stand'
                       && this._moveInput().z > 0.1;
    this.isBreathHeld = this.isADS && input.isDown('ShiftLeft');

    // 移动
    this._updateMovement(dt);
    // 视图效果(抖动/呼吸/瞄准过渡)
    this._updateView(dt);
  }

  _moveInput() {
    const i = this.input;
    let x = 0, z = 0;
    if (i.isDown('KeyW')) z += 1;
    if (i.isDown('KeyS')) z -= 1;
    if (i.isDown('KeyA')) x -= 1;
    if (i.isDown('KeyD')) x += 1;
    const len = Math.hypot(x, z);
    if (len > 0) { x /= len; z /= len; }
    return new THREE.Vector3(x, 0, z);
  }

  _updateMovement(dt) {
    const mi = this._moveInput();
    // 目标速度: 优先级 ads > crouch > prone > walkMode
    let speed;
    if (this.stance === 'crouch') speed = SPEED.crouch;
    else if (this.stance === 'prone') speed = SPEED.prone;
    else if (this.isADS) speed = SPEED.ads;
    else if (this.walkMode === 'walk') speed = SPEED.walk;
    else speed = SPEED.sprint;  // run 模式 = 疾跑 9.0

    // 朝向(yaw) 转换移动向量到世界空间
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // 前进方向: (-sin, 0, -cos), 右方向: (cos, 0, -sin)
    const dir = new THREE.Vector3(
      mi.x * cos - mi.z * sin,
      0,
      -mi.x * sin - mi.z * cos
    );
    const targetVel = dir.multiplyScalar(speed);

    // 加速度/惯性
    const accel = this.isADS ? 8 : 14;
    this.velocity.x = damp(this.velocity.x, targetVel.x, accel, dt);
    this.velocity.z = damp(this.velocity.z, targetVel.z, accel, dt);

    // 应用位置
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // 简单地面跟随 + 场景碰撞
    const groundH = this.world ? this.world.getGroundHeight(this.position.x, this.position.z) : 0;
    const targetY = groundH + this.currentHeight();

    // ---- 完整跳跃/重力物理 ----
    // 1) 每帧施加重力加速度
    this.velocity.y -= GRAVITY * dt;
    // 2) 应用 Y 速度到临时新位置
    const newY = this.position.y + this.velocity.y * dt;
    // 3) 地面碰撞: 只允许往下落, 不允许穿透
    if (newY <= targetY) {
      // 着陆 (从空中落下触发抖动)
      if (this.velocity.y < 0 && !this.onGround) {
        this.landShake = Math.min(0.4, Math.abs(this.velocity.y) * 0.04);
      }
      this.position.y = targetY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.position.y = newY;
      this.onGround = false;
    }

    // 场景障碍碰撞(简易球-盒检测), 由 world 处理
    if (this.world) this.world.collidePlayer(this.position, this.currentHeight());

    // 脚步触发
    const hspeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.moveBobPhase += hspeed * dt * (this.isSprinting ? 2.2 : 1.6);
    if (hspeed > 0.5) {
      this._footstepAcc = (this._footstepAcc || 0) + hspeed * dt;
      const stride = this.isSprinting ? 2.2 : 1.6;
      if (this._footstepAcc > stride) {
        this._footstepAcc = 0;
        if (this.world && this.world.onFootstep) this.world.onFootstep(this.position);
      }
    }
  }

  currentHeight() {
    if (this.stance === 'prone') return PRONE_HEIGHT;
    if (this.stance === 'crouch') return CROUCH_HEIGHT;
    return STAND_HEIGHT;
  }

  _applyStance(instant = false) {
    // 高度由 currentHeight 决定, 视图高度跟随
  }

  _updateView(dt) {
    // 摄像机位置 = 玩家位置 + 眼睛高度
    const eyeH = this.currentHeight() - EYE_OFFSET;
    this.camera.position.set(this.position.x, this.position.y + eyeH, this.position.z);

    // 瞄准过渡
    this.aimT = damp(this.aimT, this.isADS ? 1 : 0, 12, dt);

    // FOV (瞄准缩小)
    const targetFov = this.isADS ? this.fovBase / (this._currentZoom() || 1) : this.fovBase;
    this.fovCurrent = damp(this.fovCurrent, targetFov, 10, dt);
    if (this.camera.fov !== this.fovCurrent) {
      this.camera.fov = this.fovCurrent; this.camera.updateProjectionMatrix();
    }

    // 呼吸抖动(瞄准时屏息则减弱)
    this.breathPhase += dt * (this.isBreathHeld ? 0.6 : 1.6);
    const breathAmp = this.isBreathHeld ? 0.0008 : (this.isADS ? 0.004 : 0.012);
    const breathX = Math.sin(this.breathPhase * 1.3) * breathAmp;
    const breathY = Math.sin(this.breathPhase) * breathAmp;

    // 移动抖动
    const hspeed = Math.hypot(this.velocity.x, this.velocity.z);
    const bobAmp = clamp(hspeed * 0.0025, 0, 0.015) * (this.isSprinting ? 1.5 : 1);
    const bobX = Math.cos(this.moveBobPhase) * bobAmp;
    const bobY = Math.abs(Math.sin(this.moveBobPhase)) * bobAmp;

    // 着陆抖动衰减
    this.landShake = damp(this.landShake, 0, 8, dt);
    const landY = -this.landShake * 0.15;

    // 探头(lean) 平滑
    this.lean = damp(this.lean, this.leanTarget, 10, dt);
    const leanOffset = this.lean * 0.35;  // 横向位移
    const leanRoll = this.lean * 8;       // 摄像机滚转(度)

    // 计算最终朝向
    const euler = new THREE.Euler(this.pitch + breathY + bobY + landY, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
    // 应用滚转(探头)
    this.camera.rotateZ(-deg2rad(leanRoll));

    // 摄像机横向位移(探头)
    const right = new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);
    right.y = 0; right.normalize();
    this.camera.position.addScaledVector(right, leanOffset * 0.4);

    // 视图模型位置(右手边): hipfire 右下, ADS 时抬到屏幕中心准星对齐
    const vmTarget = this.isADS
      ? new THREE.Vector3(0, -0.06, -0.2)
      : new THREE.Vector3(0.32, -0.28, -0.42);
    this.viewmodel.position.lerp(vmTarget, 1 - Math.exp(-12 * dt));

    // 视图模型抖动
    this.viewmodelHolder.position.set(bobX * 0.5, bobY * 0.5, 0);
    this.viewmodelHolder.rotation.set(breathX * 0.3, breathX * 0.5, 0);
  }

  _currentZoom() {
    // 由 WeaponSystem 设置当前武器 zoom
    return this._weaponZoom || 1.6;
  }
  setWeaponZoom(z) { this._weaponZoom = z; }

  // ========== 受伤 ==========
  takeDamage(amount, fromPos, headshot = false) {
    if (!this.alive) return;
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.5);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    if (this.onDamage) this.onDamage(this.health, this.armor, headshot);
    if (this.health <= 0) {
      this.health = 0; this.alive = false;
      if (this.onDeath) this.onDeath(fromPos);
    }
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
    if (this.onDamage) this.onDamage(this.health, this.armor, false);
  }
}
