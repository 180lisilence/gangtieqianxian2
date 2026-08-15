// js/utils/logger.js
// 轻量级模块化日志工具
// 用法: import { log } from '../utils/logger.js';  const L = log('Audio');
//       L.info('init OK');  L.warn('xxx');  L.error('xxx', err);  L.debug('xxx');
//
// 运行时控制 (DevTools Console):
//   logger.setLevel('warn')       // 只看 warn+error
//   logger.setLevel('info')       // 默认, info+warn+error
//   logger.setLevel('debug')      // 全开, 含高频帧日志
//   logger.setModule('Audio', 'debug')   // 单独调某模块
//   logger.setModule('Soldier', 'off')   // 静音某模块
//   logger.dump(30)               // 导出最近 30 条到 console
//
// localStorage 持久化:
//   logger_level = 'info' | 'debug' | 'warn' | 'error' | 'off'
//   logger_modules = 'Audio:debug,Soldier:off'   (逗号分隔 module:level)

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, off: 4 };
const LEVEL_NAME = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

// 全局最低显示级别 (localStorage 持久化)
let _globalLevel = LEVELS.info;
// 每个模块的单独级别覆盖 { Audio: 'debug', Soldier: 'off' }
const _moduleLevel = {};
// 最近 N 条环形缓冲 (方便 logger.dump 导出)
const _ring = [];
const RING_MAX = 200;

try {
  const saved = localStorage.getItem('logger_level');
  if (saved && LEVELS[saved] !== undefined) _globalLevel = LEVELS[saved];
  const mods = localStorage.getItem('logger_modules');
  if (mods) mods.split(',').forEach(p => {
    const [m, l] = p.split(':').map(s => s.trim());
    if (m && l && LEVELS[l] !== undefined) _moduleLevel[m] = LEVELS[l];
  });
} catch (e) {}

function _now() {
  const t = new Date();
  return (
    String(t.getHours()).padStart(2,'0') + ':' +
    String(t.getMinutes()).padStart(2,'0') + ':' +
    String(t.getSeconds()).padStart(2,'0') + '.' +
    String(t.getMilliseconds()).padStart(3,'0')
  );
}

function _shouldLog(module, levelNum) {
  const threshold = _moduleLevel[module] !== undefined ? _moduleLevel[module] : _globalLevel;
  return levelNum >= threshold;
}

function _push(levelNum, module, msg, args) {
  _ring.push({ t: _now(), level: LEVEL_NAME[levelNum], mod: module, msg, args });
  if (_ring.length > RING_MAX) _ring.shift();
}

function _fmt(module, msg) {
  return `[${_now()}] [${module}] ${msg}`;
}

export function log(module) {
  return {
    debug(msg, ...args) {
      if (!_shouldLog(module, LEVELS.debug)) return;
      _push(LEVELS.debug, module, msg, args);
      console.debug(_fmt(module, msg), ...args);
    },
    info(msg, ...args) {
      if (!_shouldLog(module, LEVELS.info)) return;
      _push(LEVELS.info, module, msg, args);
      console.log(_fmt(module, msg), ...args);
    },
    warn(msg, ...args) {
      if (!_shouldLog(module, LEVELS.warn)) return;
      _push(LEVELS.warn, module, msg, args);
      console.warn(_fmt(module, msg), ...args);
    },
    error(msg, ...args) {
      if (!_shouldLog(module, LEVELS.error)) return;
      _push(LEVELS.error, module, msg, args);
      console.error(_fmt(module, msg), ...args);
    },
  };
}

// ========== 运行时控制 API (挂到 window.logger 方便 DevTools 调用) ==========
export const logger = {
  setLevel(lvl) {
    if (LEVELS[lvl] === undefined) { console.warn('logger: unknown level', lvl); return; }
    _globalLevel = LEVELS[lvl];
    try { localStorage.setItem('logger_level', lvl); } catch (e) {}
    console.log(`[logger] global level → ${lvl}`);
  },
  setModule(module, lvl) {
    if (LEVELS[lvl] === undefined) { console.warn('logger: unknown level', lvl); return; }
    _moduleLevel[module] = LEVELS[lvl];
    try {
      const parts = Object.entries(_moduleLevel).map(([m, v]) => `${m}:${LEVEL_NAME[v].toLowerCase()}`);
      localStorage.setItem('logger_modules', parts.join(','));
    } catch (e) {}
    console.log(`[logger] ${module} → ${lvl}`);
  },
  getLevel(module) {
    return LEVEL_NAME[_moduleLevel[module] ?? _globalLevel];
  },
  dump(n = RING_MAX) {
    const items = _ring.slice(-n);
    items.forEach(x => {
      const color = x.level === 'ERROR' ? '\x1b[31m' : x.level === 'WARN' ? '\x1b[33m' : '\x1b[0m';
      console.log(`${color}[${x.t}] [${x.level}] [${x.mod}] ${x.msg}\x1b[0m`, ...x.args);
    });
    console.log(`[logger] dump ${items.length}/${_ring.length} entries`);
  },
  tail(n = 20) { this.dump(n); },
  clear() { _ring.length = 0; console.log('[logger] ring cleared'); },
  list() {
    console.log('[logger] global=' + LEVEL_NAME[_globalLevel] + ', modules:', _moduleLevel);
  },
};

try { window.logger = logger; } catch (e) {}
