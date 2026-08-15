// js/audio/AudioManager.js
// 纯 MP3 文件播放架构 —— 所有音效来自 audio/ 目录
// 子目录: guns/  weapons/  ui/  voice/
// 文件未就绪时静默跳过

import * as THREE from 'three';
import { log } from '../utils/logger.js';
const L = log('Audio');

// ======================================================
// 音效文件表 —— 改文件名只改这里就行
// ======================================================
const SFX_FILES = {
  // 【guns/】每种枪型独立真实枪声
  gun_sniper: 'audio/guns/sniper.mp3',    // 狙击步枪
  gun_rifle:  'audio/guns/rifle.mp3',     // 栓动/战斗步枪
  gun_semi:   'audio/guns/semi.mp3',      // 半自动步枪 (M416/加兰德)
  gun_lmg:    'audio/guns/lmg.mp3',       // 轻/重机枪
  gun_smg:    'audio/guns/smg.mp3',       // 冲锋枪
  gun_pistol: 'audio/guns/pistol.mp3',    // 手枪
  gun_silenced: 'audio/guns/silenced.mp3', // 消音枪声 (预留)

  // 【weapons/】投掷/爆炸
  explosion:  'audio/weapons/explosion.mp3',
  grenade:    'audio/weapons/grenade.mp3',
  footstep:   'audio/weapons/footstep.mp3',

  // 【ui/】界面反馈
  reload:     'audio/ui/reload.mp3',
  hit:        'audio/ui/hit.mp3',

  // 【voice/】人声喊话
  voice_en:   'audio/voice/voice_en.mp3', // 盟军/英文
  voice_de:   'audio/voice/voice_de.mp3', // 轴心/德文
};

// 枪型 -> SFX key 映射 + 微调参数
const GUN_CFG = {
  sniper: { key: 'gun_sniper', volume: 0.70, trimEnd: 0.70, rate: 1.0, lpCut: 6000, attackMs: 25 },
  rifle:  { key: 'gun_rifle',  volume: 1.00, trimEnd: 1.00, rate: 1.0 },
  semi:   { key: 'gun_semi',   volume: 1.00, trimEnd: 0.75, rate: 1.0 },
  lmg:    { key: 'gun_lmg',    volume: 1.00, trimEnd: 0.85, rate: 1.0 },
  smg:    { key: 'gun_smg',    volume: 0.95, trimEnd: 1.00, rate: 1.0 },
  pistol: { key: 'gun_pistol', volume: 0.95, trimEnd: 1.00, rate: 1.0 },
};

export class AudioManager {
  constructor(camera) {
    this.ctx = null;
    this.master = null;
    this.listener = null;
    this.camera = camera;
    this.enabled = false;
    // 从 localStorage 读取用户设置 (默认 0.7, 未静音)
    try {
      this.muted = localStorage.getItem('sf_muted') === '1';
      this.volume = parseFloat(localStorage.getItem('sf_volume')) || 0.7;
    } catch (e) {
      this.muted = false;
      this.volume = 0.7;
    }
    this.buffers = {};
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this.listener = this.ctx.listener;
      this.enabled = true;
      L.info('AudioContext created, state=' + this.ctx.state + ', muted=' + this.muted + ', volume=' + this.volume.toFixed(2));
      this._loadAll();
    } catch (e) { L.error('Audio init failed', e); }
  }

  // 批量异步加载所有音效
  _loadAll() {
    const total = Object.keys(SFX_FILES).length;
    let loaded = 0, failed = 0;
    Object.entries(SFX_FILES).forEach(([key, fpath]) => {
      fetch('./' + fpath)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(buf => this.ctx.decodeAudioData(buf.slice(0)))
        .then(ab => {
          this.buffers[key] = ab;
          loaded++;
          L.debug('loaded ' + fpath + ' (' + ab.duration.toFixed(2) + 's)');
          if (loaded + failed === total) L.info('load done ' + loaded + '/' + total + ' ok');
        })
        .catch(e => {
          failed++;
          L.debug('failed ' + fpath + ': ' + e.message);
          if (loaded + failed === total) L.info('load done ' + loaded + '/' + total + ' ok');
        });
    });
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // ========== 公开设置 (持久化到 localStorage) ==========
  setVolume(v) {
    this.volume = THREE.MathUtils.clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    try { localStorage.setItem('sf_volume', this.volume.toString()); } catch (e) {}
  }
  getVolume() { return this.volume; }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
    try { localStorage.setItem('sf_muted', m ? '1' : '0'); } catch (e) {}
  }
  isMuted() { return this.muted; }

  update(dt) {
    if (!this.enabled || !this.listener) return;
    if (this.listener.positionX) {
      this.listener.positionX.value = this.camera.position.x;
      this.listener.positionY.value = this.camera.position.y;
      this.listener.positionZ.value = this.camera.position.z;
      const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
      this.listener.forwardX.value = fwd.x; this.listener.forwardY.value = fwd.y; this.listener.forwardZ.value = fwd.z;
      this.listener.upX.value = 0; this.listener.upY.value = 1; this.listener.upZ.value = 0;
    }
    // 每秒打印一次加载状态 (只打 1 次, 首次 update)
    if (!this._statusPrinted) {
      const keys = Object.keys(this.buffers);
      const missing = Object.keys(SFX_FILES).filter(k => !this.buffers[k]);
      L.info('loaded ' + keys.length + '/' + Object.keys(SFX_FILES).length + ' sfx, missing=[' + missing.join(', ') + ']');
      L.debug('state: enabled=' + this.enabled + ', muted=' + this.muted + ', masterGain=' + this.master?.gain?.value);
      this._statusPrinted = true;
    }
  }

  // ========== 通用采样播放器 ==========
  _playSample(bufKey, opts = {}) {
    if (!this.enabled || this.muted) return;
    const buf = this.buffers[bufKey];
    if (!buf) {
      // buffer 缺失: 首次出现时打印一次, 避免刷屏
      if (!this._missingReported) this._missingReported = {};
      if (!this._missingReported[bufKey]) {
        L.warn('buffer missing: ' + bufKey + ' (check audio/ directory)');
        this._missingReported[bufKey] = true;
      }
      return;
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const p = opts.pos ? this._panner(opts.pos) : null;

    const rate = opts.rate ?? 1.0;
    const lpCut = opts.lpCut ?? 20000;
    const hpCut = opts.hpCut ?? 20;
    const trimEnd = opts.trimEnd ?? 1.0;
    const volume = opts.volume ?? 1.0;
    const attackMs = opts.attackMs ?? 2;

    // 首次播放: 打印命中的 buffer, 便于调试 (只打一次, 每 key)
    if (!this._playedOnce) this._playedOnce = {};
    if (!this._playedOnce[bufKey]) {
      L.debug('play ' + bufKey + ' (dur ' + buf.duration.toFixed(2) + 's, vol ' + volume.toFixed(2) + ')');
      this._playedOnce[bufKey] = true;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = hpCut;
    hp.Q.value = opts.hpQ ?? 0.7;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lpCut;
    lp.Q.value = opts.lpQ ?? 0.7;

    const g = ctx.createGain();
    const effectiveDur = (buf.duration / rate) * trimEnd;
    const attackSec = attackMs / 1000;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(volume, now + attackSec);
    g.gain.exponentialRampToValueAtTime(0.0001, now + effectiveDur);

    src.connect(hp); hp.connect(lp); lp.connect(g);
    const out = p ? p : this.master;
    g.connect(out);

    src.start(now); src.stop(now + effectiveDur + 0.02);
  }

  // ========== 公开接口 ==========
  gunshot(pos, volume = 1, type = 'rifle') {
    const cfg = GUN_CFG[type] || GUN_CFG.rifle;
    this._playSample(cfg.key, {
      pos, volume: cfg.volume * volume, rate: cfg.rate, trimEnd: cfg.trimEnd,
      lpCut: cfg.lpCut ?? 20000, attackMs: cfg.attackMs ?? 2,
    });
  }

  explosion(pos, volume = 1) {
    this._playSample('explosion', { pos, volume: 1.2 * volume, rate: 0.95, lpCut: 1200, hpCut: 40 });
  }

  footstep(pos) {
    this._playSample('footstep', { pos, volume: 0.55 });
  }

  reload() {
    this._playSample('reload', { volume: 0.9 });
  }

  hitMarker() {
    this._playSample('hit', { volume: 0.8 });
  }

  voice(pos, lang, pitch = 1.0) {
    const key = (lang === 'de') ? 'voice_de' : 'voice_en';
    this._playSample(key, { pos, volume: 0.9, rate: pitch });
  }

  // ========== 内部 ==========
  _panner(pos) {
    if (!pos) return null;
    try {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 5; p.maxDistance = 200; p.rolloffFactor = 1.2;
      if (p.positionX) {
        p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      } else {
        p.setPosition(pos.x, pos.y, pos.z);
      }
      return p;
    } catch (e) { return null; }
  }
}
