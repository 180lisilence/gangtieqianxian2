// test/setup.js
// 测试公共工具: mock 世界 / 音频 / 时间控制, 供各测试用例复用

import * as THREE from 'three';
import { vi } from 'vitest';

// ========== mock 世界 ==========
// 提供 Soldier 依赖的最小 World 接口, 避免渲染/地形生成开销
export function createMockWorld(opts = {}) {
  return {
    scene: { add() {}, remove() {} },
    // 平地地形, 高度恒 0
    getGroundHeight: () => 0,
    // 默认无遮挡(射线不命中实体), 返回 null 表示视线通畅
    raycast: () => null,
    objectives: opts.objectives || [],
    coverPoints: opts.coverPoints || [],
    soldiers: [],
    tanks: [],
    spawnTracer: () => {},
    collideSoldier: null,
  };
}

// ========== mock 音频 ==========
// 所有方法 noop, 隔离音频子系统
export function createMockAudio() {
  return new Proxy({}, { get: () => () => {} });
}

// ========== 时间控制 ==========
// Soldier 大量依赖 performance.now() (开火间隔/换弹/反应延迟).
// 提供可控时钟, 便于精确测试时间相关行为.
// 注意: performance.now() 返回毫秒, 代码内 /1000 转秒, 故内部 _now 以毫秒计.
let _now = 10000;
export function resetClock(startSeconds = 10) { _now = startSeconds * 1000; }
export function advanceClock(seconds) { _now += seconds * 1000; }
export function getClock() { return _now; }

// 安装 performance.now 桩, 返回受控时钟值
export function installClock() {
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => _now);
  return spy;
}

// ========== 辅助: 等概率采样 ==========
// 多次运行含随机性的行为, 断言结果落在预期区间
export function sample(n, fn) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn());
  return out;
}
