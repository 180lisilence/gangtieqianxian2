// electron/main.js
// 钢铁前线 · Electron 主进程
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// 关闭应用菜单栏(游戏不需要)
Menu.setApplicationMenu(null);

let mainWindow = null;

function createWindow() {
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

  // 加载游戏入口
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

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
