// js/data/weapons.js
// 40+ 真实二战武器数据定义
// 通用字段说明:
//   type: rifle(步枪) / smg(冲锋枪) / lmg(轻机枪) / sniper(狙击) / semi(半自动) / pistol(手枪) / grenade(投掷) / rocket(火箭)
//   damage: 基础伤害(命中躯干)
//   fireRate: 每分钟射速(自动武器) 或 0(半自动/手动)
//   magSize / reserve: 弹匣/备弹
//   bulletSpeed: 子弹初速 m/s (用于弹道下坠与飞行时间)
//   bulletDrop: 重力影响系数
//   recoil: { v: 垂直后坐力, h: 水平散布, recover: 恢复速度 }
//   spread: 基础散布弧度(腰射), adsSpread: 瞄准散布
//   reloadTime: 秒
//   adsTime: 瞄准过渡 秒
//   range: 有效射程 m
//   penetration: 穿甲能力 0-1 (穿透掩体)
//   moveSpeed: 持枪移动速度倍率
//   zoom: 瞄准缩放(FOV倍率)
//   auto: 是否全自动

export const WEAPONS = {
  // ==================== 步枪 / 栓动 ====================
  m1garand: {
    id: 'm1garand', name: 'M1 加兰德', nameEn: 'M1 Garand', type: 'semi', faction: 'us',
    damage: 65, fireRate: 0, magSize: 8, reserve: 96,
    bulletSpeed: 853, bulletDrop: 9.8, recoil: { v: 0.025, h: 0.008, recover: 6 },
    spread: 0.015, adsSpread: 0.002, reloadTime: 3.0, adsTime: 0.28,
    range: 600, penetration: 0.5, moveSpeed: 0.95, zoom: 1.6, auto: false,
  },
  kar98k: {
    id: 'kar98k', name: 'Kar98k', nameEn: 'Karabiner 98k', type: 'rifle', faction: 'ger',
    damage: 95, fireRate: 0, magSize: 5, reserve: 75,
    bulletSpeed: 760, bulletDrop: 9.8, recoil: { v: 0.04, h: 0.01, recover: 5 },
    spread: 0.02, adsSpread: 0.001, reloadTime: 3.5, adsTime: 0.3,
    range: 800, penetration: 0.7, moveSpeed: 0.95, zoom: 2.2, auto: false,
  },
  mosin: {
    id: 'mosin', name: '莫辛纳甘', nameEn: 'Mosin-Nagant', type: 'rifle', faction: 'su',
    damage: 92, fireRate: 0, magSize: 5, reserve: 75,
    bulletSpeed: 870, bulletDrop: 9.8, recoil: { v: 0.045, h: 0.012, recover: 5 },
    spread: 0.02, adsSpread: 0.001, reloadTime: 3.6, adsTime: 0.3,
    range: 800, penetration: 0.7, moveSpeed: 0.95, zoom: 2.4, auto: false,
  },
  arisaka: {
    id: 'arisaka', name: '三八式步枪', nameEn: 'Type 38 Arisaka', type: 'rifle', faction: 'jp',
    damage: 90, fireRate: 0, magSize: 5, reserve: 75,
    bulletSpeed: 770, bulletDrop: 9.8, recoil: { v: 0.038, h: 0.01, recover: 5 },
    spread: 0.02, adsSpread: 0.001, reloadTime: 3.5, adsTime: 0.3,
    range: 750, penetration: 0.7, moveSpeed: 0.95, zoom: 2.0, auto: false,
  },
  hanyang88: {
    id: 'hanyang88', name: '汉阳造', nameEn: 'Hanyang 88', type: 'rifle', faction: 'cn',
    damage: 80, fireRate: 0, magSize: 5, reserve: 60,
    bulletSpeed: 700, bulletDrop: 9.8, recoil: { v: 0.05, h: 0.015, recover: 4 },
    spread: 0.025, adsSpread: 0.002, reloadTime: 4.0, adsTime: 0.32,
    range: 500, penetration: 0.5, moveSpeed: 0.95, zoom: 1.8, auto: false,
  },
  springfield: {
    id: 'springfield', name: '斯普林菲尔德', nameEn: 'M1903 Springfield', type: 'sniper', faction: 'us',
    damage: 110, fireRate: 0, magSize: 5, reserve: 60,
    bulletSpeed: 850, bulletDrop: 9.8, recoil: { v: 0.05, h: 0.008, recover: 4 },
    spread: 0.015, adsSpread: 0.0005, reloadTime: 3.8, adsTime: 0.35,
    range: 1000, penetration: 0.8, moveSpeed: 0.9, zoom: 6.0, auto: false,
    scoped: true,
  },
  svt40: {
    id: 'svt40', name: 'SVT-40', nameEn: 'SVT-40', type: 'semi', faction: 'su',
    damage: 60, fireRate: 0, magSize: 10, reserve: 90,
    bulletSpeed: 830, bulletDrop: 9.8, recoil: { v: 0.03, h: 0.01, recover: 6 },
    spread: 0.018, adsSpread: 0.002, reloadTime: 3.2, adsTime: 0.28,
    range: 600, penetration: 0.6, moveSpeed: 0.95, zoom: 1.7, auto: false,
  },
  gewehr43: {
    id: 'gewehr43', name: 'Gewehr 43', nameEn: 'Gewehr 43', type: 'semi', faction: 'ger',
    damage: 62, fireRate: 0, magSize: 10, reserve: 90,
    bulletSpeed: 780, bulletDrop: 9.8, recoil: { v: 0.03, h: 0.01, recover: 6 },
    spread: 0.018, adsSpread: 0.002, reloadTime: 3.2, adsTime: 0.28,
    range: 600, penetration: 0.6, moveSpeed: 0.95, zoom: 1.7, auto: false,
  },
  type44: {
    id: 'type44', name: '四四式骑枪', nameEn: 'Type 44 Carbine', type: 'rifle', faction: 'jp',
    damage: 85, fireRate: 0, magSize: 5, reserve: 60,
    bulletSpeed: 730, bulletDrop: 9.8, recoil: { v: 0.04, h: 0.012, recover: 5 },
    spread: 0.022, adsSpread: 0.0015, reloadTime: 3.5, adsTime: 0.28,
    range: 600, penetration: 0.6, moveSpeed: 0.98, zoom: 1.8, auto: false,
  },

  // ==================== 冲锋枪 ====================
  thompson: {
    id: 'thompson', name: '汤普森', nameEn: 'M1A1 Thompson', type: 'smg', faction: 'us',
    damage: 32, fireRate: 700, magSize: 30, reserve: 240,
    bulletSpeed: 400, bulletDrop: 9.8, recoil: { v: 0.012, h: 0.008, recover: 8 },
    spread: 0.04, adsSpread: 0.015, reloadTime: 2.6, adsTime: 0.22,
    range: 200, penetration: 0.25, moveSpeed: 1.05, zoom: 1.3, auto: true,
  },
  ppsh41: {
    id: 'ppsh41', name: '波波莎', nameEn: 'PPSh-41', type: 'smg', faction: 'su',
    damage: 28, fireRate: 900, magSize: 71, reserve: 355,
    bulletSpeed: 490, bulletDrop: 9.8, recoil: { v: 0.009, h: 0.007, recover: 9 },
    spread: 0.045, adsSpread: 0.018, reloadTime: 3.4, adsTime: 0.22,
    range: 200, penetration: 0.25, moveSpeed: 1.05, zoom: 1.3, auto: true,
  },
  mp40: {
    id: 'mp40', name: 'MP40', nameEn: 'MP40', type: 'smg', faction: 'ger',
    damage: 30, fireRate: 550, magSize: 32, reserve: 256,
    bulletSpeed: 400, bulletDrop: 9.8, recoil: { v: 0.01, h: 0.006, recover: 9 },
    spread: 0.04, adsSpread: 0.014, reloadTime: 2.6, adsTime: 0.22,
    range: 200, penetration: 0.25, moveSpeed: 1.05, zoom: 1.3, auto: true,
  },
  type100: {
    id: 'type100', name: '百式冲锋枪', nameEn: 'Type 100', type: 'smg', faction: 'jp',
    damage: 28, fireRate: 800, magSize: 30, reserve: 240,
    bulletSpeed: 450, bulletDrop: 9.8, recoil: { v: 0.011, h: 0.008, recover: 8 },
    spread: 0.045, adsSpread: 0.016, reloadTime: 2.8, adsTime: 0.22,
    range: 180, penetration: 0.2, moveSpeed: 1.05, zoom: 1.3, auto: true,
  },
  mp18: {
    id: 'mp18', name: 'MP18', nameEn: 'MP18', type: 'smg', faction: 'cn',
    damage: 26, fireRate: 500, magSize: 32, reserve: 256,
    bulletSpeed: 380, bulletDrop: 9.8, recoil: { v: 0.012, h: 0.008, recover: 8 },
    spread: 0.05, adsSpread: 0.018, reloadTime: 2.8, adsTime: 0.22,
    range: 150, penetration: 0.2, moveSpeed: 1.05, zoom: 1.3, auto: true,
  },

  // ==================== 轻机枪 ====================
  bar: {
    id: 'bar', name: 'BAR M1918', nameEn: 'Browning Automatic Rifle', type: 'lmg', faction: 'us',
    damage: 45, fireRate: 600, magSize: 20, reserve: 200,
    bulletSpeed: 850, bulletDrop: 9.8, recoil: { v: 0.022, h: 0.012, recover: 6 },
    spread: 0.035, adsSpread: 0.012, reloadTime: 3.4, adsTime: 0.32,
    range: 400, penetration: 0.5, moveSpeed: 0.85, zoom: 1.5, auto: true,
  },
  dp28: {
    id: 'dp28', name: 'DP-28', nameEn: 'DP-28', type: 'lmg', faction: 'su',
    damage: 42, fireRate: 550, magSize: 47, reserve: 235,
    bulletSpeed: 840, bulletDrop: 9.8, recoil: { v: 0.02, h: 0.01, recover: 6 },
    spread: 0.035, adsSpread: 0.012, reloadTime: 4.0, adsTime: 0.35,
    range: 400, penetration: 0.5, moveSpeed: 0.82, zoom: 1.5, auto: true,
  },
  mg42: {
    id: 'mg42', name: 'MG42', nameEn: 'MG42', type: 'lmg', faction: 'ger',
    damage: 38, fireRate: 1200, magSize: 50, reserve: 250,
    bulletSpeed: 800, bulletDrop: 9.8, recoil: { v: 0.018, h: 0.014, recover: 5 },
    spread: 0.04, adsSpread: 0.014, reloadTime: 5.0, adsTime: 0.4,
    range: 500, penetration: 0.6, moveSpeed: 0.78, zoom: 1.5, auto: true,
  },
  fg42: {
    id: 'fg42', name: 'FG42', nameEn: 'FG42', type: 'lmg', faction: 'ger',
    damage: 40, fireRate: 750, magSize: 20, reserve: 200,
    bulletSpeed: 760, bulletDrop: 9.8, recoil: { v: 0.025, h: 0.012, recover: 6 },
    spread: 0.035, adsSpread: 0.012, reloadTime: 3.4, adsTime: 0.3,
    range: 400, penetration: 0.5, moveSpeed: 0.88, zoom: 1.6, auto: true,
  },
  type99mg: {
    id: 'type99mg', name: '九九式轻机枪', nameEn: 'Type 99 LMG', type: 'lmg', faction: 'jp',
    damage: 40, fireRate: 800, magSize: 30, reserve: 240,
    bulletSpeed: 730, bulletDrop: 9.8, recoil: { v: 0.022, h: 0.012, recover: 6 },
    spread: 0.038, adsSpread: 0.013, reloadTime: 3.8, adsTime: 0.35,
    range: 400, penetration: 0.5, moveSpeed: 0.82, zoom: 1.5, auto: true,
  },
  zb26: {
    id: 'zb26', name: 'ZB26', nameEn: 'ZB26', type: 'lmg', faction: 'cn',
    damage: 42, fireRate: 500, magSize: 20, reserve: 200,
    bulletSpeed: 760, bulletDrop: 9.8, recoil: { v: 0.02, h: 0.01, recover: 6 },
    spread: 0.035, adsSpread: 0.012, reloadTime: 3.6, adsTime: 0.34,
    range: 400, penetration: 0.5, moveSpeed: 0.85, zoom: 1.5, auto: true,
  },

  // ==================== 手枪 ====================
  m1911: {
    id: 'm1911', name: 'M1911', nameEn: 'Colt M1911', type: 'pistol', faction: 'us',
    damage: 35, fireRate: 0, magSize: 7, reserve: 56,
    bulletSpeed: 350, bulletDrop: 9.8, recoil: { v: 0.02, h: 0.01, recover: 8 },
    spread: 0.03, adsSpread: 0.01, reloadTime: 1.6, adsTime: 0.15,
    range: 80, penetration: 0.2, moveSpeed: 1.1, zoom: 1.2, auto: false,
  },
  colt_cmd: {
    id: 'colt_cmd', name: '柯特指挥官', nameEn: 'Colt Commander', type: 'pistol', faction: 'us',
    damage: 33, fireRate: 0, magSize: 7, reserve: 56,
    bulletSpeed: 340, bulletDrop: 9.8, recoil: { v: 0.022, h: 0.012, recover: 8 },
    spread: 0.032, adsSpread: 0.011, reloadTime: 1.6, adsTime: 0.15,
    range: 80, penetration: 0.2, moveSpeed: 1.1, zoom: 1.2, auto: false,
  },
  tt33: {
    id: 'tt33', name: 'TT-33', nameEn: 'TT-33', type: 'pistol', faction: 'su',
    damage: 38, fireRate: 0, magSize: 8, reserve: 64,
    bulletSpeed: 420, bulletDrop: 9.8, recoil: { v: 0.022, h: 0.012, recover: 8 },
    spread: 0.03, adsSpread: 0.01, reloadTime: 1.7, adsTime: 0.15,
    range: 90, penetration: 0.25, moveSpeed: 1.1, zoom: 1.2, auto: false,
  },
  nagant: {
    id: 'nagant', name: '纳甘左轮', nameEn: 'M1895 Nagant', type: 'pistol', faction: 'su',
    damage: 40, fireRate: 0, magSize: 7, reserve: 56,
    bulletSpeed: 320, bulletDrop: 9.8, recoil: { v: 0.025, h: 0.014, recover: 7 },
    spread: 0.035, adsSpread: 0.012, reloadTime: 2.4, adsTime: 0.16,
    range: 80, penetration: 0.25, moveSpeed: 1.1, zoom: 1.2, auto: false,
  },
  p08: {
    id: 'p08', name: '鲁格P08', nameEn: 'Luger P08', type: 'pistol', faction: 'ger',
    damage: 34, fireRate: 0, magSize: 8, reserve: 64,
    bulletSpeed: 380, bulletDrop: 9.8, recoil: { v: 0.018, h: 0.01, recover: 8 },
    spread: 0.028, adsSpread: 0.009, reloadTime: 1.8, adsTime: 0.15,
    range: 80, penetration: 0.2, moveSpeed: 1.1, zoom: 1.2, auto: false,
  },
  walther: {
    id: 'walther', name: '瓦尔特P38', nameEn: 'Walther P38', type: 'pistol', faction: 'ger',
    damage: 33, fireRate: 0, magSize: 8, reserve: 64,
    bulletSpeed: 370, bulletDrop: 9.8, recoil: { v: 0.019, h: 0.01, recover: 8 },
    spread: 0.029, adsSpread: 0.01, reloadTime: 1.8, adsTime: 0.15,
    range: 80, penetration: 0.2, moveSpeed: 1.1, zoom: 1.2, auto: false,
  },
  nambu: {
    id: 'nambu', name: '南部十四式', nameEn: 'Type 14 Nambu', type: 'pistol', faction: 'jp',
    damage: 30, fireRate: 0, magSize: 8, reserve: 64,
    bulletSpeed: 330, bulletDrop: 9.8, recoil: { v: 0.02, h: 0.012, recover: 8 },
    spread: 0.032, adsSpread: 0.011, reloadTime: 1.9, adsTime: 0.15,
    range: 70, penetration: 0.18, moveSpeed: 1.1, zoom: 1.2, auto: false,
  },
  type14: { id: 'type14', name: '十四式', nameEn: 'Type 14', type: 'pistol', faction: 'jp',
    damage: 30, fireRate: 0, magSize: 8, reserve: 64,
    bulletSpeed: 330, bulletDrop: 9.8, recoil: { v: 0.02, h: 0.012, recover: 8 },
    spread: 0.032, adsSpread: 0.011, reloadTime: 1.9, adsTime: 0.15,
    range: 70, penetration: 0.18, moveSpeed: 1.1, zoom: 1.2, auto: false },
  type10: {
    id: 'type10', name: '十年式手枪', nameEn: 'Type 10', type: 'pistol', faction: 'cn',
    damage: 28, fireRate: 0, magSize: 6, reserve: 48,
    bulletSpeed: 300, bulletDrop: 9.8, recoil: { v: 0.022, h: 0.014, recover: 7 },
    spread: 0.035, adsSpread: 0.012, reloadTime: 2.0, adsTime: 0.15,
    range: 60, penetration: 0.15, moveSpeed: 1.1, zoom: 1.2, auto: false,
  },

  // ==================== 投掷物 / 火箭 ====================
  mk2: {
    id: 'mk2', name: 'MK2 破片雷', nameEn: 'MK2 Frag', type: 'grenade', faction: 'us',
    damage: 180, magSize: 3, reserve: 3, fuseTime: 4.0, throwRange: 35,
    radius: 8, moveSpeed: 1.0, recoil: { v: 0, h: 0, recover: 6 },
  },
  rgd33: {
    id: 'rgd33', name: 'RGD-33', nameEn: 'RGD-33', type: 'grenade', faction: 'su',
    damage: 170, magSize: 3, reserve: 3, fuseTime: 3.5, throwRange: 35,
    radius: 7.5, moveSpeed: 1.0, recoil: { v: 0, h: 0, recover: 6 },
  },
  m24: {
    id: 'm24', name: 'M24 木柄雷', nameEn: 'Stielhandgranate 24', type: 'grenade', faction: 'ger',
    damage: 160, magSize: 3, reserve: 3, fuseTime: 4.5, throwRange: 40,
    radius: 8, moveSpeed: 1.0, recoil: { v: 0, h: 0, recover: 6 },
  },
  type97: {
    id: 'type97', name: '九七式手雷', nameEn: 'Type 97', type: 'grenade', faction: 'jp',
    damage: 150, magSize: 3, reserve: 3, fuseTime: 4.0, throwRange: 35,
    radius: 7, moveSpeed: 1.0, recoil: { v: 0, h: 0, recover: 6 },
  },
  type98: {
    id: 'type98', name: '九八式', nameEn: 'Type 98', type: 'grenade', faction: 'jp',
    damage: 140, magSize: 2, reserve: 2, fuseTime: 4.0, throwRange: 30,
    radius: 6.5, moveSpeed: 1.0, recoil: { v: 0, h: 0, recover: 6 },
  },
  white_phosphorus: {
    id: 'white_phosphorus', name: '白磷弹', nameEn: 'White Phosphorus', type: 'grenade', faction: 'us',
    damage: 80, magSize: 2, reserve: 2, fuseTime: 2.5, throwRange: 30,
    radius: 10, moveSpeed: 1.0, burn: true, recoil: { v: 0, h: 0, recover: 6 },
  },
  molotov: {
    id: 'molotov', name: '莫洛托夫', nameEn: 'Molotov', type: 'grenade', faction: 'su',
    damage: 70, magSize: 2, reserve: 2, fuseTime: 1.5, throwRange: 25,
    radius: 9, moveSpeed: 1.0, burn: true, recoil: { v: 0, h: 0, recover: 6 },
  },
  panzerfaust: {
    id: 'panzerfaust', name: '铁拳', nameEn: 'Panzerfaust', type: 'rocket', faction: 'ger',
    damage: 400, magSize: 1, reserve: 2, bulletSpeed: 120, throwRange: 0,
    radius: 6, moveSpeed: 0.85, antiVehicle: true, recoil: { v: 0.03, h: 0.01, recover: 4 },
  },
};

// 武器分类查询
export function weaponsByFaction(factionId) {
  return Object.values(WEAPONS).filter(w => w.faction === factionId);
}
export function weaponsByType(type) {
  return Object.values(WEAPONS).filter(w => w.type === type);
}
