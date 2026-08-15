// vitest.config.mjs
// 单元测试配置: jsdom 环境 + ES 模块支持(three 直接从 node_modules 解析)

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
    globals: false,
  },
});
