// js/main.js
// 入口: 创建画布, 启动 Game, 处理加载流程

import { Game } from './engine/Game.js';

// 创建全屏画布
const canvas = document.createElement('canvas');
canvas.id = 'gameCanvas';
canvas.style.position = 'fixed';
canvas.style.inset = '0';
canvas.style.display = 'block';
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);

// 加载界面(立即隐藏,不阻塞)
const loadingScreen = document.getElementById('loadingScreen');
if (loadingScreen) loadingScreen.classList.add('hidden');

// 直接启动游戏(无需等待加载流程)
const start = async () => {
  await import('three');
  const game = new Game(canvas);
  window.__game = game;
  // 显示主菜单(loading 已隐藏, 菜单默认 hidden, 需主动显示)
  game.menu.show();
};

start().catch(err => {
  console.error(err);
  if (loadingScreen) {
    loadingScreen.classList.remove('hidden');
    const lt = document.getElementById('loadingText');
    if (lt) { lt.textContent = '加载失败: ' + err.message; lt.style.color = '#ff5050'; }
  }
});

// 窗口尺寸同步
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});
