// js/utils/MathUtils.js
// 通用数学 / 随机 / 工具函数

import * as THREE from 'three';

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const randRange = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(randRange(a, b + 1));
export const randPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const deg2rad = (d) => d * Math.PI / 180;

// 伪随机数生成器(种子化), 用于地图生成可复现
export class RNG {
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next() {
    // xorshift32
    let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

// 简易噪声(值噪声), 用于地形起伏
export class ValueNoise {
  constructor(seed = 1) { this.rng = new RNG(seed); this.cache = new Map(); }
  _value(ix, iz) {
    const key = ix + ',' + iz;
    if (!this.cache.has(key)) {
      this.cache.set(key, this.rng.next() * 2 - 1);
    }
    return this.cache.get(key);
  }
  sample(x, z, scale = 1) {
    const sx = x * scale, sz = z * scale;
    const ix = Math.floor(sx), iz = Math.floor(sz);
    const fx = sx - ix, fz = sz - iz;
    // smoothstep
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const v00 = this._value(ix, iz),     v10 = this._value(ix + 1, iz);
    const v01 = this._value(ix, iz + 1), v11 = this._value(ix + 1, iz + 1);
    const a = lerp(v00, v10, ux);
    const b = lerp(v01, v11, ux);
    return lerp(a, b, uz);
  }
}

// 向量工具
export const tmpV1 = new THREE.Vector3();
export const tmpV2 = new THREE.Vector3();
export const tmpV3 = new THREE.Vector3();

// 球面线性插值方向(用于平滑转向)
export function smoothAngle(current, target, t) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}

// AABB 包围盒工具
export class AABB {
  constructor(min, max) { this.min = min.clone(); this.max = max.clone(); }
  contains(p) {
    return p.x >= this.min.x && p.x <= this.max.x &&
           p.y >= this.min.y && p.y <= this.max.y &&
           p.z >= this.min.z && p.z <= this.max.z;
  }
  expand(d) { return new AABB(this.min.clone().subScalar(d), this.max.clone().addScalar(d)); }
}
