// electron/main.js
// 钢铁前线 · Electron 主进程
// ⚠️ 必须先启动本地 HTTP server (因为 ES Modules + fetch 音频不能用 file://)
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { start: startServer } = require('../server.js');

// 关闭应用菜单栏(游戏不需要)
Menu.setApplicationMenu(null);

let mainWindow = null;
let devServer = null;

async function createWindow() {
  // 启动本地静态文件服务器 (Electron 渲染进程需要 http:// 协议才能 fetch ES Modules 和 mp3)
  // 端口冲突时自动试下一个
  let port = 8000;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await startServer(port + attempt);
      devServer = result.server;
      port = result.port;
      break;
    } catch (e) {
      console.warn('[electron] port ' + (port + attempt) + ' busy, trying ' + (port + attempt + 1));
    }
  }
  if (!devServer) {
    console.error('[electron] failed to start dev server after 5 attempts');
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    title: '钢铁前线 · 狙击',
    backgroundColor: '#000000',
    show: false,           // 准备好后再显示,避免白屏
    autoHideMenuBar: true,
    webPreferences: {
      // 不用 nodeIntegration, 保持纯前端游戏环境
      nodeIntegration: false,
      contextIsolation: true,
      // 允许 pointer lock / 全屏
      webSecurity: true,
    },
  });

  // ⚠️ 用 HTTP URL, 不是 loadFile (否则 file:// 下 fetch mp3 会被 Chromium abort)
  mainWindow.loadURL('http://localhost:' + port + '/index.html');

  // 准备就绪后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 默认最大化(更接近 PUBG 全屏体验)
    mainWindow.maximize();
  });

  // 窗口关闭
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 允许浏览器内全屏切换(F11 由 Electron 默认处理)
  // 游戏内 ESC 已用于暂停, 这里不拦截
}

// Electron 就绪后创建窗口
app.whenReady().then(createWindow);

// 所有窗口关闭时退出(macOS 除外)
app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
