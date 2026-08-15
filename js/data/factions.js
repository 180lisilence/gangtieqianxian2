// js/data/factions.js
// 6 大阵营数据定义
// 语音语言: 用于匹配人声触发时的语言包

export const FACTIONS = {
  // ==================== 美军 ====================
  us: {
    id: 'us',
    name: '美军',
    nameEn: 'US Army',
    language: 'en',
    color: 0x4a6b8a,
    accentColor: 0xc9a96a,
    description: '装备精良、火力压制强大，诺曼底登陆主力。',
    soldierColor: 0x5a6b3a,    // 橄榄绿军装
    helmetColor: 0x3a4a2a,
    skinColor: 0xc9a98a,
    weapons: {
      primary: ['m1garand', 'bar', 'thompson', 'springfield'],
      secondary: ['m1911', 'colt_cmd'],
      grenade: ['mk2', 'white_phosphorus'],
    },
    voicePitch: 0.9,
  },

  // ==================== 苏军 ====================
  su: {
    id: 'su',
    name: '苏军',
    nameEn: 'Red Army',
    language: 'ru',
    color: 0x8a3a3a,
    accentColor: 0xffd700,
    description: '人海与钢铁洪流，斯大林格勒的钢铁意志。',
    soldierColor: 0x6b5a3a,    // 棕褐色军装
    helmetColor: 0x3a3a2a,
    skinColor: 0xc9a98a,
    weapons: {
      primary: ['mosin', 'ppsh41', 'dp28', 'svt40'],
      secondary: ['tt33', 'nagant'],
      grenade: ['rgd33', 'molotov'],
    },
    voicePitch: 0.85,
  },

  // ==================== 德军 ====================
  ger: {
    id: 'ger',
    name: '德军',
    nameEn: 'Wehrmacht',
    language: 'de',
    color: 0x5a5a3a,
    accentColor: 0x8a8a8a,
    description: '战术严谨、装备先进，闪电战与防御大师。',
    soldierColor: 0x4a5a3a,    // 野灰绿
    helmetColor: 0x3a4a2a,
    skinColor: 0xc9a98a,
    weapons: {
      primary: ['kar98k', 'mp40', 'mg42', 'fg42', 'gewehr43'],
      secondary: ['p08', 'walther'],
      grenade: ['m24', 'panzerfaust'],
    },
    voicePitch: 0.95,
  },

  // ==================== 日军 ====================
  jp: {
    id: 'jp',
    name: '日军',
    nameEn: 'IJA',
    language: 'jp',
    color: 0x8a6b3a,
    accentColor: 0xc0392b,
    description: '丛林与岛屿防御专家，万岁冲锋令人胆寒。',
    soldierColor: 0x6b6b3a,    // 卡其
    helmetColor: 0x4a4a2a,
    skinColor: 0xd4b896,
    weapons: {
      primary: ['arisaka', 'type100', 'type99mg', 'type44'],
      secondary: ['nambu', 'type14'],
      grenade: ['type97', 'type98'],
    },
    voicePitch: 1.05,
  },

  // ==================== 国军 ====================
  cn: {
    id: 'cn',
    name: '国军',
    nameEn: 'ROC Army',
    language: 'cn',
    color: 0x4a5a6b,
    accentColor: 0xc0392b,
    description: '淞沪、滇缅，艰苦卓绝的正面战场。',
    soldierColor: 0x5a6b3a,
    helmetColor: 0x3a4a2a,
    skinColor: 0xd4b896,
    weapons: {
      primary: ['hanyang88', 'mp18', 'zb26', 'springfield'],
      secondary: ['m1911', 'type10'],
      grenade: ['m24', 'mk2'],
    },
    voicePitch: 1.0,
  },

  // ==================== 八路军 ====================
  cpc: {
    id: 'cpc',
    name: '八路军',
    nameEn: 'Eighth Route Army',
    language: 'cn',
    color: 0x6b2a2a,
    accentColor: 0xffd700,
    description: '敌后游击、百团大战，以弱胜强的人民军队。',
    soldierColor: 0x4a5a3a,    // 灰布军装
    helmetColor: 0x3a3a2a,
    skinColor: 0xd4b896,
    weapons: {
      primary: ['hanyang88', 'mosin', 'zb26', 'type44'],
      secondary: ['nagant', 'type10'],
      grenade: ['m24', 'rgd33'],
    },
    voicePitch: 1.0,
  },
};

export const FACTION_LIST = Object.values(FACTIONS);
