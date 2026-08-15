# 钢铁前线 · 狙击 — 项目技术文档

> 给 AI 辅助编程用。读完这份文档，你应该能快速定位代码结构、关键数据、修改入口。

---

## 1. 项目概览

| 项 | 值 |
|---|---|
| 名称 | 钢铁前线 · 狙击 (Steel Frontline Sniper) |
| 类型 | 二战写实 FPS (Electron + Three.js 3D) |
| 技术栈 | Node 18+, Electron 30, Three.js 0.160, Vitest + jsdom |
| 语言 | 纯 ES Module JavaScript (无构建步骤, Electron 直接跑) |
| 打包工具 | electron-builder (`npm run dist`) |
| 打包产物 | NSIS 安装版 `.exe` + 便携版 `.exe`, 输出 `dist5/` |
| 核心玩法 | 占点 (A/B/C Capture Points) + 兵力券 (Tickets) 模式 |
| 阵营 | 美军 us / 苏军 su / 德军 ger / 日军 jp / 国军 cn / 八路军 cpc |
| 战役 | 10 大战役 (诺曼底/斯大林格勒/柏林/淞沪/百团/滇缅/莫斯科/奥马哈/灯塔岛/珍珠港) |
| 武器 | 40+ 真实二战武器 (步枪/栓动/冲锋枪/轻机枪/狙击/手枪/投掷/火箭) |

---

## 2. 快速启动

```bash
# 开发启动 (直接跑 Electron)
.\play.bat

# 打包 exe (NSIS 安装版 + 便携版)
.\build.bat

# 跑单元测试
npm test          # 单次
npm run test:watch # 监听模式
```

**注意**: 打包后资源目录在 `dist5/win-unpacked/resources/app/`，`asar: false` 所以 mp3 是原样拷贝的文件（不是压缩进 asar）。**打包前必须关闭正在运行的游戏窗口**，否则旧 `app.asar` 被锁。

---

## 3. 目录结构

```
d:\java编程文件夹\狙击\
├── index.html              入口页面 (加载 js/main.js)
├── package.json            Electron + electron-builder 配置
├── play.bat                开发者启动脚本 (双击或 .\play.bat)
├── build.bat               打包脚本
│
├── electron/
│   └── main.js             Electron 主进程 (BrowserWindow + 菜单关闭)
│
├── js/
│   ├── main.js             前端入口: 创建 Game 实例, 连 canvas
│   │
│   ├── engine/             ⭐ 核心引擎
│   │   ├── Game.js         游戏主控制器 (整合所有子系统, 游戏循环, 胜负判定)
│   │   ├── Renderer.js     Three.js 渲染器封装 (后处理, 动态效果)
│   │   └── Input.js        输入系统 (键鼠状态, Pointer Lock)
│   │
│   ├── world/              世界对象
│   │   ├── World.js        场景构建 (地形/光照/天空盒/据点标记/爆炸)
│   │   └── Tank.js         AI 载具
│   │
│   ├── ai/
│   │   └── Soldier.js      ⭐ 核心 AI (巡逻/索敌/开火/换弹/受伤死亡)
│   │
│   ├── player/
│   │   ├── PlayerController.js  玩家控制 (移动/冲刺/探头/瞄准)
│   │   ├── WeaponSystem.js      ⭐ 武器系统 (射击逻辑/散布/弹道/命中检测/手雷)
│   │   └── WeaponFactory.js     武器实例工厂
│   │
│   ├── audio/
│   │   └── AudioManager.js ⭐ 纯 MP3 播放 (批量加载 + 通用 _playSample)
│   │
│   ├── ui/
│   │   ├── HUD.js          游戏中 HUD (血量/弹药/小地图/击杀信息)
│   │   └── MainMenu.js     主菜单 (战役/阵营/武器/画质选择)
│   │
│   ├── data/               ⭐ 全部数据配置 (改数值只改这里)
│   │   ├── weapons.js      40+ 武器数据 (damage/fireRate/recoil/spread...)
│   │   ├── campaigns.js    10 战役数据 (阵营对抗/地图种子/光照/据点)
│   │   └── factions.js     6 阵营数据 (颜色/武器池/语音语言)
│   │
│   └── utils/
│       └── MathUtils.js    randPick/randRange/clamp/lerp 等
│
├── audio/                  ⭐ 音效文件 (打包原样拷贝)
│   ├── guns/               每种枪型独立 mp3
│   │   ├── sniper.mp3
│   │   ├── rifle.mp3
│   │   ├── semi.mp3
│   │   ├── lmg.mp3
│   │   ├── smg.mp3
│   │   ├── pistol.mp3
│   │   └── silenced.mp3    (预留)
│   ├── weapons/            explosion.mp3 / grenade.mp3 / footstep.mp3
│   ├── ui/                 reload.mp3 / hit.mp3
│   └── voice/              voice_en.mp3 / voice_de.mp3
│
├── css/style.css
└── test/
    ├── setup.js            Vitest jsdom + 可控时钟 mock
    └── soldier.test.js     Soldier 行为测试 (26 用例)
```

---

## 4. 关键数据流 & 修改入口

### 4.1 主循环 (Game.js)
```
Game._startGame() → 构建 World/Player/Soldiers/Tanks
         ↓
Game._update(dt)  ← 每帧 60fps
  ├── Input.update()     键鼠状态
  ├── World.update()     据点/爆炸/环境
  ├── Soldiers[].update  AI 决策 + 开火
  ├── Player.update()    玩家输入 → 移动/射击
  ├── Weapons.update()   弹道检测 (raycast)
  ├── Audio.update()     3D 听众位置
  ├── HUD.update()       血条/弹药/击杀信息
  └── _checkVictory()    占点/兵力券 → 胜负
```

### 4.2 武器数据 (weapons.js) 改数值只改这里
```js
// 通用字段:
damage: 65           // 命中躯干伤害
fireRate: 0          // 0 = 半自动/手动, >0 = RPM (自动)
magSize / reserve    // 弹匣 / 备弹
bulletSpeed: 853     // 子弹初速 m/s
bulletDrop: 9.8      // 重力系数
recoil: { v, h, recover }  // 后坐力 (垂直/水平/恢复速度)
spread: 0.015        // 腰射散布弧度
adsSpread: 0.002     // 瞄准散布弧度
reloadTime: 3.0      // 换弹秒
range: 600           // 有效射程 m
penetration: 0.5     // 掩体穿透 0-1
type: 'semi' | 'rifle' | 'smg' | 'lmg' | 'sniper' | 'pistol' | 'grenade' | 'rocket'
auto: true / false
```

### 4.3 AudioManager (audio/AudioManager.js)
```js
// SFX_FILES: key → 相对 index.html 的路径
// 新增音效只要:
//   1. 把 mp3 放进 audio/xxx/yyy.mp3
//   2. 在 SFX_FILES 加一行
//   3. 在 public 方法里 this._playSample('key', { opts })

// 枪型差异化在 GUN_CFG, 支持:
//   volume / trimEnd (截断尾部) / rate (pitch) / lpCut (低通) / hpCut (高通) / attackMs (攻击时间)
// 特殊: sniper 已配 attackMs=25ms + lpCut=6000 + volume=0.70 (避免太吓人)
```

### 4.4 新增战役 (campaigns.js)
```js
// 1. 在 CAMPAIGNS 加新对象
// 2. seed 控制 World 程序化生成 (相同 seed = 相同地图)
// 3. objectives: [{ id, name, position:[x,0,z], radius }]
// 4. teamSize 控制双方 AI 数量
// 5. tickets: 兵力券 (耗尽即输)
// 6. weather/天空颜色/fog 直接影响 World.js 光照
```

### 4.5 新增武器 (weapons.js) → factions.js 加到阵营池
```js
// 1. WEAPONS 加新条目, 填齐所有字段
// 2. 所在阵营 factions.js → weapons.primary 数组里加入武器 id
// 3. WeaponSystem / Soldier 会自动识别 type 字段选音效
```

---

## 5. 重要代码约定 (别搞反!)

| 约定 | 位置 | 说明 |
|------|------|------|
| **raycast 必须 excludeShooter** | Soldier.js / WeaponSystem.js | 玩家射击时把玩家自身从 ray 命中列表排除, AI 同理, 否则会击中自己 |
| **死亡只扣一次券** | Game.js `_onSoldierDeath()` | AI 死亡时 `s.onDeath` + `s.onKill` 都触发, 但扣券只在这一个入口做 |
| **时钟单位用 ms** | Soldier.js fire timer | `performance.now()` 返回 ms, 计算射击间隔用秒要 `/1000` |
| **burst 暂停从最后一发起算** | Soldier.js | 连射过热的 `burstResetTime` 在每次开火后刷新 |
| **换弹只在弹匣空时触发** | WeaponSystem.js | 自动武器弹满不换弹, 手动 R 才强制换 |
| **FOV 120° 视野锥** | Soldier.js `_canSee` | AI 背后 >6m 看不到敌人, 近距 6m 内 360° 可感知 |
| **packaging: asar: false** | package.json | fetch() 无法从 asar 内读二进制, 所以不用 asar, 文件原样拷贝 |
| **audio/ 目录直接暴露** | package.json → files | `audio/**/*` 在打包时保留原样, 不要塞进 asar |

---

## 6. 测试

```bash
npm test            # 跑一次 (快, < 2s)
npm run test:watch  # 改代码后自动重跑
```

**测试文件**: `test/soldier.test.js` (26 用例, 覆盖 Soldier 行为)

**测试框架**: Vitest + jsdom (`test/setup.js` 提供 mock World/Audio + 可控时钟)

**改了 Soldier.js / WeaponSystem.js 一定要跑测试!** 测试通过 = 行为没变。

---

## 7. 常见修改场景速查

| 想做什么 | 改哪里 |
|----------|--------|
| 调某把枪伤害/射速/后坐力 | `js/data/weapons.js` |
| 新增一把枪 | `weapons.js` 加条目 → `factions.js` 加到对应阵营武器池 |
| 调某战役光照/雾/颜色 | `js/data/campaigns.js` |
| 新增战役 | `campaigns.js` 加条目 (seed 决定地图) |
| 调 AI 反应速度/开火节奏 | `js/ai/Soldier.js` |
| 新增/替换音效 | mp3 放进 `audio/xx/` → `AudioManager.js` SFX_FILES 加条目 |
| 调枪声音量/滤波/pitch | `AudioManager.js` GUN_CFG |
| 换玩家武器默认配置 | `js/player/WeaponFactory.js` |
| 调移动速度 | `PlayerController.js` (玩家) / `Soldier.js` (AI) |
| 调视野锥/索敌距离 | `Soldier.js` `_canSee` |
| 改小地图大小/位置 | `css/style.css` → `#minimap` |
| 加新按键 | `Input.js` → `MainMenu.js` 或 HTML hints |
| 打包 exe | `.\build.bat` |

---

## 8. 打包配置 (package.json build 段)

```
asar: false              ← 关键! 资源不压缩, fetch 能读 mp3
files: [index.html, audio/**/*, css/**/*, js/**/*, electron/**/*, node_modules/three/**/*, package.json]
win.target: [nsis, portable]  ← 同时出安装版和便携版
nsis.oneClick: false     ← 用户可选安装目录
nsis.createDesktopShortcut: true
output: dist5
```

**注意事项**:
- 打包前**必须关闭游戏窗口**, 否则 `resources/app.asar` 被锁 (虽然我们用 asar:false, 仍可能有残留句柄)
- 打包后文件在 `dist5/`, 直接发给朋友就能玩, 对方不需要装 Node.js

---

## 9. 音效系统架构

```
audio/
├── guns/           7 个独立枪声 mp3 (每种枪型一个)
├── weapons/        explosion / footstep / grenade
├── ui/             reload / hit
└── voice/          voice_en / voice_de

AudioManager 启动时:
  _loadAll() → SFX_FILES 表 fetch + decodeAudioData → 存入 this.buffers

播放时:
  gunshot(pos, vol, type)  → GUN_CFG[type].key → _playSample(key, opts)
  explosion(pos, vol)      → _playSample('explosion', { lpCut: 1200, rate: 0.95 })
  ...

_playSample 滤波器链: BufferSource → HP → LP → Gain(attackMs+trimEnd) → Panner/Master
```

**静默跳过**: 文件不存在时 fetch 失败 → 被 catch 吞掉 → 播放函数发现 `this.buffers[key]` 为空 → return, 不报错不刷屏。

**sniper 特殊处理** (避免太吓人):
- volume 0.70, trimEnd 0.70, lpCut 6000, attackMs 25

---

## 10. 版本约束

- Node.js 18+ (20+ 更好)
- Electron 30.x (不要降级)
- Three.js 0.160 (不要大升级, API 可能变)
- Windows 10/11 (打包产物 x64)
- **不要改** `vitest.config.mjs` / `.npmrc` (有 electron mirror 配置)

---

## 11. 开发规范

- **纯 ES Module** (`import` / `export`)，不要加 CommonJS
- **不要引入新的 npm 依赖**，Three.js 已够用
- **改数据不改逻辑**：数值调优只改 `js/data/*.js`
- **改完跑 `npm test`**，26 用例全绿才提交
- **不要用 `npm` 直接跑打包**，用 `.\build.bat`（它清理 dist 目录）
- 编码统一 UTF-8，换行符 LF（Git 会自动处理）
