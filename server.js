// 开发用静态文件服务器(运行 ES 模块游戏需要 HTTP)
// 既可独立运行: node server.js
// 也可被 Electron 主进程 require: require('./server.js').start(8000)
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
};

function createHandler(root) {
  return (req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(root, urlPath);
    // 防目录穿越
    if (!filePath.startsWith(root)) { res.writeHead(403); res.end('403'); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found: ' + urlPath);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
    });
  };
}

/**
 * 启动静态文件服务器
 * @param {number} port 端口, 默认 8000
 * @param {string} root 根目录, 默认 __dirname
 * @returns {Promise<{port:number, server:http.Server}>}
 */
function start(port = 8000, root = __dirname) {
  return new Promise((resolve, reject) => {
    const handler = createHandler(root);
    const server = http.createServer(handler);
    server.on('error', reject);
    server.listen(port, () => {
      console.log('[server] listening on http://localhost:' + port);
      resolve({ port, server });
    });
  });
}

// 独立运行时自动启动 (electron 模式下被 require 但不走这里)
if (require.main === module) {
  start().catch(e => { console.error('[server] failed:', e.message); process.exit(1); });
}

module.exports = { start, createHandler };
