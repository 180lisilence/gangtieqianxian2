// test/soldier.test.js
// 士兵行为逻辑单元测试
// 覆盖: 受伤死亡 / 巡逻路点 / 移动速度 / 开火节奏 / 换弹 / 射线排除发射者
// 依据: project_memory 中的硬约束与工程约定

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { Soldier } from '../js/ai/Soldier.js';
import {
  createMockWorld,
  createMockAudio,
  resetClock,
  advanceClock,
  installClock,
  sample,
} from './setup.js';

// mock 掉武器模型工厂: Soldier 仅 import 未使用, 屏蔽其 THREE 几何体创建副作用
vi.mock('../js/player/WeaponFactory.js', () => ({ createSimpleRifle: () => null }));

// ========== 工厂: 构造带受控时钟的士兵 ==========
function makeSoldier(factionId = 'us', opts = {}) {
  const world = createMockWorld();
  const audio = createMockAudio();
  const pos = new THREE.Vector3(0, 0, 0);
  const s = new Soldier(factionId, pos, world, audio, opts);
  return { s, world, audio };
}

// 多帧推进移动, 让 damp 速度收敛到目标值后返回速度模长
function runMoveUntilStable(s, frames = 25, dt = 0.05) {
  for (let i = 0; i < frames; i++) s._updateMovement(dt);
  return Math.hypot(s.velocity.x, s.velocity.z);
}

let clockSpy;
beforeEach(() => {
  // 起始 10s, 避开 lastShotTime=0 的初始边界, 便于测试开火间隔
  resetClock(10);
  clockSpy = installClock();
});

// ============================================================
// 1. 受击与死亡
//    硬约束: 士兵死后不得再受伤 / 不得重复扣兵力券
// ============================================================
describe('受击与死亡', () => {
  it('死亡后不再受伤且血量保持 0', () => {
    const { s } = makeSoldier();
    s.takeDamage(100, null, false, null); // 致命一击
    expect(s.alive).toBe(false);
    expect(s.health).toBe(0);

    // 再次受击不应改变血量
    const killed = s.takeDamage(50, null, false, null);
    expect(killed).toBe(false);
    expect(s.health).toBe(0);
  });

  it('血量不会出现负数(夹到 0)', () => {
    const { s } = makeSoldier();
    s.takeDamage(999, null, false, null);
    expect(s.health).toBe(0);
    expect(s.health).toBeGreaterThanOrEqual(0);
  });

  it('存活时受击从 idle 切换到 engage', () => {
    const { s } = makeSoldier();
    s.state = 'idle';
    const attacker = { position: new THREE.Vector3(5, 0, 0) };
    s.takeDamage(10, null, false, attacker);
    expect(s.state).toBe('engage');
  });

  it('存活时受击从 patrol 切换到 engage', () => {
    const { s } = makeSoldier();
    s.state = 'patrol';
    const attacker = { position: new THREE.Vector3(5, 0, 0) };
    s.takeDamage(10, null, false, attacker);
    expect(s.state).toBe('engage');
  });

  it('onDeath 回调只触发一次(防重复扣票)', () => {
    const { s } = makeSoldier();
    let count = 0;
    s.onDeath = () => count++;

    s.takeDamage(100, null, false, null); // 首次死亡触发
    s.takeDamage(100, null, false, null); // 已死, 不应再触发
    s.die(null);                          // 重复调用 die 也安全

    expect(count).toBe(1);
  });
});

// ============================================================
// 2. 巡逻路点生成
//    约定: 3-5 个环绕路点, 半径 15-35m
// ============================================================
describe('巡逻路点生成', () => {
  it('路点数量在 3-5 之间', () => {
    const counts = sample(50, () => {
      const { s } = makeSoldier();
      s._generatePatrol();
      return s._patrolPoints.length;
    });
    counts.forEach(c => {
      expect(c).toBeGreaterThanOrEqual(3);
      expect(c).toBeLessThanOrEqual(5);
    });
  });

  it('每个路点距生成中心 15-35m', () => {
    // 多次采样覆盖随机性
    sample(30, () => {
      const { s } = makeSoldier();
      s._generatePatrol();
      s._patrolPoints.forEach(p => {
        const d = Math.hypot(p.x - s.position.x, p.z - s.position.z);
        expect(d).toBeGreaterThanOrEqual(15);
        expect(d).toBeLessThanOrEqual(35);
      });
    });
  });
});

// ============================================================
// 3. 移动速度
//    约定: patrol 2.6 / search 3.8 / advance 4.5 / flank 4.5 / cover 4.2
// ============================================================
describe('移动速度', () => {
  it('patrol 状态速度约 2.6 m/s', () => {
    const { s } = makeSoldier();
    s.state = 'patrol';
    s._generatePatrol();
    s.position.set(-100, 0, -100); // 远离首个路点, 确保持续移动
    const sp = runMoveUntilStable(s);
    expect(sp).toBeGreaterThan(2.3);
    expect(sp).toBeLessThan(2.9);
  });

  it('search 状态速度约 3.8 m/s', () => {
    const { s } = makeSoldier();
    s.state = 'search';
    s.moveTarget = new THREE.Vector3(100, 0, 0);
    s.position.set(0, 0, 0);
    const sp = runMoveUntilStable(s);
    expect(sp).toBeGreaterThan(3.5);
    expect(sp).toBeLessThan(4.1);
  });

  it('advance 状态速度约 4.5 m/s', () => {
    const { s } = makeSoldier();
    s.state = 'advance';
    s.moveTarget = new THREE.Vector3(100, 0, 0);
    s.position.set(0, 0, 0);
    const sp = runMoveUntilStable(s);
    expect(sp).toBeGreaterThan(4.2);
    expect(sp).toBeLessThan(4.8);
  });

  it('flank 状态速度约 4.5 m/s', () => {
    const { s } = makeSoldier();
    s.state = 'flank';
    s.moveTarget = new THREE.Vector3(100, 0, 0);
    s.position.set(0, 0, 0);
    const sp = runMoveUntilStable(s);
    expect(sp).toBeGreaterThan(4.2);
    expect(sp).toBeLessThan(4.8);
  });

  it('cover 状态速度约 4.2 m/s', () => {
    const { s } = makeSoldier();
    s.state = 'cover';
    s.coverPos = new THREE.Vector3(100, 0, 0);
    s.position.set(0, 0, 0);
    const sp = runMoveUntilStable(s);
    expect(sp).toBeGreaterThan(3.9);
    expect(sp).toBeLessThan(4.5);
  });
});

// ============================================================
// 4. 开火节奏
//    约定: 狙击 1.5s / 栓动 1.1s / 半自动 0.22s / 手枪 0.28s
//    硬约束: 自动武器 3-5 发点射后停顿 0.45-0.85s
// ============================================================
describe('开火节奏', () => {
  it('狙击枪(springfield)开火间隔 1.5s', () => {
    const { s } = makeSoldier('us', { weaponId: 'springfield' });
    expect(s.weapon.type).toBe('sniper');
    s.target = { position: new THREE.Vector3(0, 0, -50), alive: true };

    // 首发: now=10, lastShotTime=0, 间隔足够 -> 开火
    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(4); // 5-1

    // 推进 1.49s, 仍小于 1.5s -> 不开火
    advanceClock(1.49);
    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(4);

    // 再推进 0.02s(累计 1.51s) -> 开火
    advanceClock(0.02);
    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(3);
  });

  it('栓动步枪(kar98k)开火间隔 1.1s', () => {
    const { s } = makeSoldier('ger', { weaponId: 'kar98k' });
    expect(s.weapon.type).toBe('rifle');
    s.target = { position: new THREE.Vector3(0, 0, -50), alive: true };

    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(4);

    advanceClock(1.09);
    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(4);

    advanceClock(0.02);
    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(3);
  });

  it('半自动(m1garand)开火间隔 0.22s', () => {
    const { s } = makeSoldier('us', { weaponId: 'm1garand' });
    expect(s.weapon.type).toBe('semi');
    s.target = { position: new THREE.Vector3(0, 0, -50), alive: true };

    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(7); // 8-1

    advanceClock(0.21);
    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(7);

    advanceClock(0.02);
    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(6);
  });

  it('手枪(m1911)开火间隔 0.28s', () => {
    const { s } = makeSoldier('us', { weaponId: 'm1911' });
    expect(s.weapon.type).toBe('pistol');
    s.target = { position: new THREE.Vector3(0, 0, -50), alive: true };

    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(6); // 7-1

    advanceClock(0.27);
    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(6);

    advanceClock(0.02);
    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(5);
  });

  it('自动武器(bar)3-5 发点射后停顿 0.45-0.85s', () => {
    const { s } = makeSoldier('us', { weaponId: 'bar' });
    expect(s.weapon.auto).toBe(true);
    s.target = { position: new THREE.Vector3(0, 0, -50), alive: true };

    const interval = 60 / s.weapon.fireRate; // 0.1s

    // 连续开火直到点射结束(某次不开火即停顿)
    let fired = 0;
    for (let i = 0; i < 15; i++) {
      advanceClock(interval + 0.001); // 每发间隔略大于射速间隔
      const before = s.ammoMag;
      s._tryFire(0.05, 50);
      if (s.ammoMag < before) fired++;
      else break;
    }
    expect(fired).toBeGreaterThanOrEqual(3);
    expect(fired).toBeLessThanOrEqual(5);

    // 停顿从最后一发开火时算起(burstResetTime = 最后一发的 now)
    // 故基于 lastFireTime 精确设置时钟, 避免 advanceClock 累加导致的边界漂移
    const lastFireTime = s.burstResetTime;
    const magAfterBurst = s.ammoMag;

    // now - lastFireTime = 0.44 (< 0.45 下界) -> 必然不开火
    resetClock(lastFireTime + 0.44);
    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(magAfterBurst);

    // now - lastFireTime = 0.86 (> 0.85 上界) -> 必然恢复开火
    resetClock(lastFireTime + 0.86);
    s._tryFire(0.05, 50);
    expect(s.ammoMag).toBe(magAfterBurst - 1);
  });
});

// ============================================================
// 5. 换弹
//    逻辑: 弹匣空且备弹>0 触发换弹; 备弹耗尽不换弹; 完成后正确补给
// ============================================================
describe('换弹', () => {
  it('弹匣空且备弹>0 时触发换弹', () => {
    const { s } = makeSoldier('us', { weaponId: 'm1garand' });
    s.target = { position: new THREE.Vector3(0, 0, -50), alive: true };
    s.ammoMag = 0;
    s.ammoReserve = 50;

    s._updateCombat(0.05); // 战斗更新会检测到弹匣空 -> 换弹
    expect(s.reloading).toBe(true);
  });

  it('备弹为 0 时不触发换弹', () => {
    const { s } = makeSoldier('us', { weaponId: 'm1garand' });
    s.target = { position: new THREE.Vector3(0, 0, -50), alive: true };
    s.ammoMag = 0;
    s.ammoReserve = 0;

    s._updateCombat(0.05);
    expect(s.reloading).toBe(false);
  });

  it('换弹完成后弹匣补满、备弹正确扣减', () => {
    const { s } = makeSoldier('us', { weaponId: 'm1garand' });
    s.ammoMag = 2;
    s.ammoReserve = 50;
    // magSize=8, 需补 6 发
    s._startReload();
    expect(s.reloading).toBe(true);

    s._finishReload();
    expect(s.ammoMag).toBe(8);
    expect(s.ammoReserve).toBe(44);
    expect(s.reloading).toBe(false);
  });

  it('备弹不足以补满时取全部剩余', () => {
    const { s } = makeSoldier('us', { weaponId: 'm1garand' });
    s.ammoMag = 6;
    s.ammoReserve = 1; // 只够补 1 发
    s._startReload();
    s._finishReload();
    expect(s.ammoMag).toBe(7);
    expect(s.ammoReserve).toBe(0);
  });
});

// ============================================================
// 6. 射线排除发射者
//    硬约束: raycast 必须排除射手自身, 防止自击
// ============================================================
describe('射线排除发射者', () => {
  it('_canSee 调用 world.raycast 时传入自身作为 excludeShooter', () => {
    const { s, world } = makeSoldier();
    const raycastSpy = vi.fn(() => null);
    world.raycast = raycastSpy;

    const enemy = { position: new THREE.Vector3(0, 0, -10) };
    // 目标在 -Z 方向, 让士兵面向 -Z(yaw=0 -> fwd=(0,0,-1)) 确保通过 FOV 检查
    s.yaw = 0;
    s._canSee(enemy);

    expect(raycastSpy).toHaveBeenCalled();
    // 第 4 个参数为 excludeShooter, 必须是士兵自身
    expect(raycastSpy.mock.calls[0][3]).toBe(s);
  });

  it('_tryFire 开火射线排除自身', () => {
    const { s, world } = makeSoldier('us', { weaponId: 'm1garand' });
    const raycastSpy = vi.fn(() => null);
    world.raycast = raycastSpy;
    s.target = { position: new THREE.Vector3(0, 0, -50), alive: true };

    s._tryFire(0.05, 50);

    expect(raycastSpy).toHaveBeenCalled();
    expect(raycastSpy.mock.calls[0][3]).toBe(s);
  });
});

// ============================================================
// 7. FOV 视野锥
//    修复: _canSee 后方盲区逻辑原本是死代码(只有注释没有 return)
//    约定: 前方 120 度可见, 身后 >6m 不可见, 身后 <=6m 仍可见(近距感知)
// ============================================================
describe('FOV 视野锥', () => {
  it('正前方目标(10m)可见, raycast 被调用', () => {
    const { s, world } = makeSoldier();
    const raycastSpy = vi.fn(() => null);
    world.raycast = raycastSpy;

    // s.yaw=0 -> fwd=(0,0,-1); 目标在 (0,0,-10) 正前方
    s.yaw = 0;
    const enemy = { position: new THREE.Vector3(0, 0, -10) };
    const result = s._canSee(enemy);

    expect(raycastSpy).toHaveBeenCalled(); // 走到了射线阶段
    expect(result).toBe(true);
  });

  it('身后目标(10m)不可见, raycast 不被调用', () => {
    const { s, world } = makeSoldier();
    const raycastSpy = vi.fn(() => null);
    world.raycast = raycastSpy;

    // s.yaw=0 -> fwd=(0,0,-1); 目标在 (0,0,+10) 正后方
    s.yaw = 0;
    const enemy = { position: new THREE.Vector3(0, 0, 10) };
    const result = s._canSee(enemy);

    expect(raycastSpy).not.toHaveBeenCalled(); // FOV 提前拦截
    expect(result).toBe(false);
  });

  it('身后近距离目标(3m)仍可见(近距感知)', () => {
    const { s, world } = makeSoldier();
    const raycastSpy = vi.fn(() => null);
    world.raycast = raycastSpy;

    // s.yaw=0; 目标在 (0,0,3) 身后但 <=6m
    s.yaw = 0;
    const enemy = { position: new THREE.Vector3(0, 0, 3) };
    const result = s._canSee(enemy);

    expect(raycastSpy).toHaveBeenCalled(); // 允许近距, 走到射线阶段
    expect(result).toBe(true);
  });
});
