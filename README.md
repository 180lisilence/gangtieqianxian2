# 钢铁前线 · 狙击

> **Steel Frontline Sniper** —— 二战写实 FPS。Electron + Three.js 打造的纯前端 3D 射击游戏。

- 🔫 **20+ 真实二战武器**：Kar98k、M1 加兰德、MG42、MP40、莫辛纳甘……
- 🗺️ **10 大战役**：诺曼底、斯大林格勒、柏林、淞沪、百团、滇缅、莫斯科……
- 🌏 **6 大阵营**：美军、苏军、德军、日军、国军、八路军
- 🎯 **占点 + 兵力券模式**：攻占据点 / 耗尽敌方兵力即胜
- 🤖 **AI 智能士兵**：巡逻、索敌、包抄、掩体、推进，有 120° 视野锥
- 🚗 **坦克载具**：可驾驶，独立 AI 炮手
- 🔊 **真实音效**：每种枪型独立 MP3，3D 空间声像
- ✅ **单元测试**：Vitest 覆盖 AI 核心行为

---

## 📦 快速开始

### 环境要求

- **Node.js 18+**（推荐 20 LTS）
- **Windows 10 / 11 64 位**（当前仅打包 Windows）
- 无需安装任何全局工具（`node_modules` 本地安装）

### 克隆 & 启动

```bash
# 1. 克隆仓库
git clone https://github.com/180lisilence/gangtieqianxian2.git
cd gangtieqianxian2

# 2. 安装依赖（首次运行会自动安装）
npm install

# 3. 启动游戏（开发模式）
.\play.bat
```

游戏启动后：
1. 从主菜单选择 **战役 / 阵营 / 主副武器 / 画质**
2. 点击 **开始战斗**
3. 画面加载后，单击游戏区域锁定鼠标
4. 按 `WASD` 移动，`左键` 开火，`右键` 瞄准

### 打包发布

```bash
# 一键打包 NSIS 安装版 + 便携版 exe
.\build.bat
```

产物输出在 `dist5/`：
- `钢铁前线-1.0.0-安装版-x64.exe` —— 带安装向导的安装版
- `钢铁前线-1.0.0-便携版-x64.exe` —— 免安装单文件
- `win-unpacked/钢铁前线.exe` —— 解压后的独立目录

> **打包注意**：打包前请**关闭正在运行的游戏窗口**，否则旧文件可能被锁定。打包后发给朋友即可运行，对方不需要安装 Node.js。

### 跑测试

```bash
npm test            # 跑一次（秒级完成）
npm run test:watch  # 监听模式，改代码自动重跑
```

测试框架：**Vitest + jsdom**，26 个用例覆盖 AI 士兵受伤/死亡/开火/换弹/视野锥等核心行为。改了 Soldier.js 或 WeaponSystem.js 一定要跑一下。

---

## 🎵 音频文件配置（必须自备）

仓库是**纯源代码**，二进制音频不包含在内。首次启动游戏时请按以下清单放置 MP3 文件：

### 必需文件（枪声 + 换弹，缺失则静音）

| 目录 | 文件名 | 用途 |
|------|--------|------|
| `audio/guns/` | `sniper.mp3` | 狙击步枪（Springfield 等） |
| `audio/guns/` | `rifle.mp3` | 栓动步枪（Kar98k / 莫辛纳甘 / 三八式） |
| `audio/guns/` | `semi.mp3` | 半自动步枪（M1 加兰德 / SVT-40） |
| `audio/guns/` | `lmg.mp3` | 轻/重机枪（MG42 / BAR / DP-28） |
| `audio/guns/` | `smg.mp3` | 冲锋枪（MP40 / 波波莎 / 汤普森） |
| `audio/guns/` | `pistol.mp3` | 手枪（M1911 / 鲁格 P08 / TT-33） |
| `audio/ui/` | `reload.mp3` | 换弹音效 |

### 可选文件（缺失静默跳过，游戏照常）

| 目录 | 文件名 | 用途 |
|------|--------|------|
| `audio/guns/` | `silenced.mp3` | 消音枪声（预留） |
| `audio/weapons/` | `explosion.mp3` | 手雷 / 坦克炮爆炸 |
| `audio/weapons/` | `footstep.mp3` | AI 士兵脚步 |
| `audio/ui/` | `hit.mp3` | 命中标记 "叮" |
| `audio/voice/` | `voice_en.mp3` | 盟军英文喊话（"Contact!"） |
| `audio/voice/` | `voice_de.mp3` | 轴心德文喊话（"Feind in Sicht!"） |

### 格式要求

- 容器：**MP3**（浏览器 Web Audio 原生支持）
- 采样率：44100 Hz（推荐），22050 Hz 也可
- 声道：单声 / 立体声均可
- 码率：128 kbps+
- **关键**：文件名必须完全匹配上表（小写，`.mp3` 后缀）

### 放好后验证

游戏启动后按 `F12` 打开 DevTools，Console 里应看到：
```
[Audio] ✓ audio/guns/sniper.mp3 (2.15s)
[Audio] ✓ audio/guns/rifle.mp3 (1.83s)
...
[Audio] ✓ audio/ui/reload.mp3 (0.92s)
```

如果没看到对应条目，说明文件路径或格式有问题。

> **好消息**：缺失的文件不会让游戏崩溃——播放时自动检查，没有 buffer 就静默跳过。所以可以先放几个核心的（sniper / rifle / smg / pistol / reload），其他慢慢补。

---

## 🎮 游戏玩法

### 核心模式：占点 + 兵力券

```
┌─────────────────────────────────────────┐
│  游戏开始                                 │
│  ├─ 玩家选择 战役 / 阵营 / 武器           │
│  ├─ 攻击方 (attacker) 出生在地图一侧      │
│  ├─ 防守方 (defender) 出生在另一侧         │
│  ├─ 双方各有兵力券 (tickets, 200~220)      │
│  │                                        │
│  ▼                                        │
│  战斗进行                                  │
│  ├─ 攻占据点：玩家/AI 在据点范围内停留     │
│  │   据点进度条从 0% → 100% → 归属本阵营   │
│  ├─ 消灭敌人：每击杀一名敌人，对方扣 1 券  │
│  ├─ 死亡：玩家/AI 阵亡也扣本阵营 1 券      │
│  │                                        │
│  ▼                                        │
│  胜负判定                                  │
│  ├─ 攻击方胜：① 攻占全部据点              │
│  │         或 ② 防守方券归零              │
│  ├─ 防守方胜：① 攻击方券归零              │
│  │                                        │
│  按 R 键返回主菜单                         │
└─────────────────────────────────────────┘
```

### 控制键

| 按键 | 功能 |
|------|------|
| `W/A/S/D` | 移动 |
| `Shift` | 冲刺 |
| `Ctrl` | 切换行走/疾跑 |
| `C` | 蹲下 |
| `Z` | 卧倒 |
| `Q/E` | 探头（左倾 / 右倾） |
| `空格` | 跳跃 |
| `鼠标左键` | 开火 |
| `鼠标右键` | 瞄准（ADS） |
| `Shift`（瞄准时） | 屏息（稳定精度） |
| `R` | 换弹 |
| `F` | 互动（进入/离开坦克） |
| `T` | 驾驶坦克 |
| `1/2/3` 或滚轮 | 切换武器 |
| `V` | 小队指令（进攻/坚守/跟随） |
| `G` | 投掷手雷（按住拉环，松开扔） |
| `ESC` | 暂停菜单 |
| `F12` | 调试面板（显示 FPS、兵力券、据点进度、AI 存活数） |

### AI 士兵行为

AI 士兵有一个状态机：

```
          ┌─────── 听到枪声/被击中 ───────┐
          ▼                               │
[patrol]──┐                              │ 近距离
          │ 发现敌人                      │ 血<35%
          ▼                              ▼    │
       [engage] ←──包抄到位── [flank]      │
          │                 ▲             │
          ▼ 血<35%          │ 远距离       │
       [cover] ──找到掩体───┘             │
                                          │
       没看到目标 ←──────────────────────┘
          │
          ▼
       [search] → 搜索最后目击位置
          │
          ▼ 没找到
       [patrol] 巡逻
```

- **视野锥 120°**：AI 背后 >6m 看不到敌人，但近距 6m 内仍有 360° 感知
- **射击节奏**：栓动 1.1s / 狙击 1.5s / 半自动 0.22s / 冲锋枪 550-900 RPM
- **自动武器**：AI 打 3-5 发点射后停顿 0.45-0.85s（模拟过热）
- **精度衰减**：距离越远精度越低，移动中命中率下降

---

## 📁 目录结构

```
gangtieqianxian2/
├── index.html                 入口页面（加载 js/main.js）
├── package.json               Electron + electron-builder 配置
├── README.md                  ← 你现在在读的
├── AI_GUIDE.md                AI 辅助编程技术文档（给开发者）
├── .gitignore                 排除 node_modules / dist5 / *.mp3
│
├── play.bat                   开发启动脚本（双击）
├── build.bat                  打包脚本（双击）
├── run_dev.bat                开发服务器（可选，用于 HTML 调试）
├── server.js                  静态文件服务器（开发期用）
│
├── electron/
│   └── main.js                Electron 主进程（BrowserWindow）
│
├── js/
│   ├── main.js                前端入口：创建 Game，连 canvas
│   │
│   ├── engine/                ⭐ 核心引擎
│   │   ├── Game.js            游戏主控制器（主循环 / 胜负 / 整合子系统）
│   │   ├── Renderer.js        Three.js 渲染器封装（后处理 / 动态效果）
│   │   └── Input.js           输入系统（键鼠状态 / Pointer Lock）
│   │
│   ├── player/
│   │   ├── PlayerController.js   玩家控制（移动 / 冲刺 / 探头 / 瞄准）
│   │   ├── WeaponSystem.js       ⭐ 武器系统（射击逻辑 / 弹道 / 命中 / 手雷）
│   │   └── WeaponFactory.js      武器 3D 模型工厂
│   │
│   ├── ai/
│   │   └── Soldier.js         ⭐ AI 士兵（状态机 / 巡逻 / 开火 / 换弹 / 受伤死亡）
│   │
│   ├── world/
│   │   ├── World.js           场景构建（地形 / 光照 / 天空盒 / 据点标记）
│   │   └── Tank.js            坦克（玩家驾驶 + AI 自动）
│   │
│   ├── audio/
│   │   └── AudioManager.js    ⭐ 纯 MP3 播放（批量加载 + 通用 _playSample）
│   │
│   ├── ui/
│   │   ├── HUD.js             游戏内 HUD（血量 / 弹药 / 小地图 / 击杀信息）
│   │   └── MainMenu.js        主菜单（战役 / 阵营 / 武器 / 画质）
│   │
│   ├── data/                  ⭐ 全部数据配置（调数值只改这里）
│   │   ├── weapons.js        40+ 武器数据（damage / fireRate / recoil / spread...）
│   │   ├── campaigns.js      10 战役数据（阵营 / 地图种子 / 光照 / 据点）
│   │   └── factions.js       6 阵营数据（颜色 / 武器池 / 语音）
│   │
│   └── utils/
│       └── MathUtils.js       randPick / randRange / clamp / lerp 等
│
├── audio/                     ⭐ 音效目录（用户自备 MP3）
│   ├── guns/                  README.txt 说明需要哪些文件
│   ├── ui/
│   ├── voice/
│   └── weapons/
│
├── css/
│   └── style.css              全部 UI 样式
│
├── launcher/                  Java 启动器（可选，旧版遗留）
│   └── src/main/java/...
│
└── test/
    ├── setup.js               Vitest + jsdom mock
    └── soldier.test.js        Soldier 行为测试（26 用例）
```

---

## 🛠️ 数据速查

### 武器类型（weapons.js 中 type 字段）

| type | 说明 | 自动/手动 | 代表武器 |
|------|------|-----------|----------|
| `rifle` | 栓动/战斗步枪 | 手动 | Kar98k、莫辛纳甘、三八式、汉阳造 |
| `sniper` | 狙击步枪 | 手动 | Springfield（斯普林菲尔德） |
| `semi` | 半自动步枪 | 手动 | M1 加兰德、SVT-40、G43 |
| `smg` | 冲锋枪 | 自动 | MP40、波波莎、汤普森、百式、MP18 |
| `lmg` | 轻/重机枪 | 自动 | MG42、BAR、DP-28、FG42、ZB26 |
| `pistol` | 手枪 | 手动 | M1911、鲁格 P08、TT-33、P38 |
| `grenade` | 投掷物 | - | MK2、RGD-33、M24 木柄雷 |
| `rocket` | 火箭/铁拳 | - | Panzerfaust |

### 武器数据字段

```js
{
  id: 'kar98k', name: 'Kar98k', type: 'rifle', faction: 'ger',
  damage: 95,           // 命中躯干伤害（头 ×2.2，四肢 ×0.65）
  fireRate: 0,          // 0 = 手动/半自动，>0 = RPM（自动武器）
  magSize: 5, reserve: 75,
  bulletSpeed: 760,     // 初速 m/s
  bulletDrop: 9.8,      // 重力系数
  recoil: { v: 0.04, h: 0.01, recover: 5 },
  spread: 0.02,         // 腰射散布弧度
  adsSpread: 0.001,     // 瞄准散布弧度
  reloadTime: 3.5,      // 换弹秒
  range: 800,           // 有效射程 m
  penetration: 0.7,     // 掩体穿透 0-1
  auto: false,
}
```

### 战役数据字段

```js
{
  id: 'normandy', name: '诺曼底登陆',
  attacker: 'us', defender: 'ger',
  seed: 19440606,              // 决定程序化生成的地图形状
  teamSize: 12, tickets: 200,
  timeOfDay: 'morning',
  weather: 'overcast',
  fog: 0.012,
  skyColor: 0x9aa6b0,          // 天空 / 太阳 / 地面颜色
  groundColor: 0x6b6452,
  objectives: [
    { id: 'A', name: '滩头据点 A', position: [0, 0, -40], radius: 10 },
    ...
  ],
}
```

---

## 🧰 常见修改场景

| 想做什么 | 改哪里 |
|----------|--------|
| 调某把枪的伤害 / 射速 / 后坐力 | `js/data/weapons.js` |
| 新增一把枪 | `weapons.js` 加条目 → `factions.js` 加到对应阵营武器池 |
| 调某战役的光照 / 雾 / 地面颜色 | `js/data/campaigns.js` |
| 新增战役 | `campaigns.js` 加条目（seed 决定地图形状） |
| 调 AI 反应速度 / 开火节奏 | `js/ai/Soldier.js` |
| 新增 / 替换音效 | mp3 放进 `audio/xx/` → `AudioManager.js` 的 `SFX_FILES` 加条目 |
| 调枪声音量 / 滤波 / pitch | `AudioManager.js` 的 `GUN_CFG` |
| 调 AI 视野锥 / 索敌距离 | `Soldier.js` 的 `_canSee()` |
| 改移动速度 | `PlayerController.js`（玩家）/ `Soldier.js`（AI） |
| 改 HUD 颜色 / 大小 | `css/style.css` |
| 打包 exe | `.\build.bat` |

---

## ⚠️ 技术约束（别乱改）

| 约束 | 文件 | 原因 |
|------|------|------|
| **`asar: false`** | `package.json` | `fetch()` 无法从 asar 内读 mp3，必须文件原样拷贝 |
| **不要引入新 npm 依赖** | - | 纯 Three.js 架构够用，加依赖会让打包体积暴增 |
| **不要改 `vitest.config.mjs` / `.npmrc`** | - | 有 Electron mirror 配置，改了可能装不上 |
| **raycast 必须 excludeShooter** | Soldier.js / WeaponSystem.js | 否则会击中自己（已踩过坑） |
| **死亡只扣一次券** | Game.js `_onSoldierDeath()` | AI 的 onDeath / onKill 都触发，扣券只在这一个入口 |

---

## 🧱 技术栈

| 组件 | 版本 | 用途 |
|------|------|------|
| **Electron** | 30.x | 跨平台桌面容器 |
| **Three.js** | 0.160 | 3D 渲染引擎 |
| **Web Audio API** | - | 3D 空间音效（浏览器原生） |
| **Vitest** | 4.x | 单元测试 |
| **jsdom** | 30.x | Vitest 的 DOM mock |
| **electron-builder** | 24.x | 打包 exe（NSIS 安装版 + 便携版） |
| **Node.js** | 18+ | 开发 / 构建环境 |

> **无构建步骤**：项目是纯 ES Module JavaScript，Electron 直接加载 `index.html` → `js/main.js`。你不需要安装 Webpack / Vite / Rollup 之类的构建工具。

---

## 🤝 贡献

欢迎贡献！提 Issue 或 Pull Request 都可以。

### 开发规范

- 纯 ES Module（`import` / `export`），不要加 CommonJS `require`
- 改数据不改逻辑：数值调优只改 `js/data/*.js`
- 改完跑 `npm test`，26 用例全绿才提交
- 编码 UTF-8，换行符 LF（Git 自动处理）

### 提交前 checklist

- [ ] `npm test` 全部通过
- [ ] 新功能手动跑 `play.bat` 验证
- [ ] 不要把 `dist5/`、`node_modules/`、`*.mp3` 提交进 Git

---

## 📜 License

暂未指定。仅供学习交流使用。

---

## 🔗 相关文档

- [AI 辅助编程技术文档](AI_GUIDE.md) —— 开发者技术手册（代码结构、关键数据流、修改入口）
- [audio/ 目录说明](audio/) —— 各子目录 README.txt 列出了需要的 mp3 文件清单
