/**
 * 一键验证入口 —— `npm test` 的实际执行者。
 *
 * 背景：React 重构时删掉了旧版的 scripts/verify-build.mjs，但 package.json
 * 里的 "test" 仍指向它，导致 `npm test` 直接报 MODULE_NOT_FOUND ——
 * 也就是说本地已经没有任何一条命令能跑通全套测试了（CI 里是逐条手写的，
 * 覆盖不到这个缺口）。本文件把这个缺口补上，并把本地验证与 CI 验证对齐。
 *
 * 流程：
 *   1. TypeScript 类型检查（tsc --noEmit）
 *   2. 生产构建（vite build）
 *   3. 启动本地预览服务（vite preview，自动挑一个空闲端口）
 *   4. 逻辑测试（不需要 HTTP 服务）
 *        - render-test.mjs     各视图真实 SSR 渲染不抛异常
 *        - truncate-test.mjs   卡片正文 ≤ 300 字且不篡改原文
 *        - masonry-test.mjs    瀑布流几何 + 跨文件常量一致性
 *   5. 浏览器测试（需要 HTTP 服务，真实 Chromium）
 *        - browser-test.mjs    渲染 / 中文输入 / 主题 / 控制台无错误
 *        - responsive-test.mjs 各断点列数 / 溢出 / 重排
 *   6. 关闭预览服务，汇总结果
 *
 * 用法：
 *   npm test                 完整验证
 *   npm test -- --skip-build 跳过构建，复用现有 dist/
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const SKIP_BUILD = args.includes('--skip-build');

/** 每个测试阶段的展示名与命令 */
const LOGIC_TESTS = [
  { name: '渲染冒烟', file: 'scripts/render-test.mjs' },
  { name: '正文截断', file: 'scripts/truncate-test.mjs' },
  { name: '瀑布流几何', file: 'scripts/masonry-test.mjs' },
];

const BROWSER_TESTS = [
  { name: '浏览器端到端', file: 'scripts/browser-test.mjs' },
  { name: '响应式布局', file: 'scripts/responsive-test.mjs' },
];

const results = [];
let previewProc = null;

function log(line = '') {
  console.log(line);
}

function hr(title) {
  log('');
  log('='.repeat(62));
  log(`  ${title}`);
  log('='.repeat(62));
}

/** 运行一条命令并把输出透传到终端，返回退出码 */
function run(cmd, cmdArgs, { quiet = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: process.env,
  });
  if (quiet && r.stdout) log(r.stdout.replace(/^/gm, '  '));
  if (quiet && r.stderr) log(r.stderr.replace(/^/gm, '  '));
  return r.status === 0;
}

/** 找一个空闲的本地端口 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** 轮询等待预览服务就绪 */
async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch { /* 还没起来，继续等 */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function stopPreview() {
  if (!previewProc || previewProc.killed) return;
  previewProc.kill('SIGTERM');
  previewProc = null;
}

// 任何退出路径都要关掉预览服务，别把端口占着
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { stopPreview(); process.exit(130); });
}
process.on('exit', stopPreview);

// ---------- 1. 类型检查 ----------
hr('1 / 5  TypeScript 类型检查');
const typeOk = run('npx', ['tsc', '--noEmit']);
results.push({ name: '类型检查', ok: typeOk });
if (!typeOk) {
  log('\n类型检查未通过，后续步骤跳过。');
  report();
  process.exit(1);
}

// ---------- 2. 构建 ----------
if (!SKIP_BUILD) {
  hr('2 / 5  生产构建');
  const buildOk = run('npx', ['vite', 'build']);
  results.push({ name: '生产构建', ok: buildOk });
  if (!buildOk) {
    log('\n构建失败，后续步骤跳过。');
    report();
    process.exit(1);
  }
} else {
  hr('2 / 5  生产构建（已跳过，复用现有 dist/）');
  results.push({ name: '生产构建（跳过）', ok: true });
}

// ---------- 3. 启动预览服务 ----------
hr('3 / 5  启动预览服务');
const distDir = path.join(ROOT, 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  log('dist/index.html 不存在 —— 无法启动预览服务。');
  results.push({ name: '预览服务', ok: false });
  report();
  process.exit(1);
}

const port = await findFreePort();
const base = `http://127.0.0.1:${port}/`;
previewProc = spawn('npx', ['vite', 'preview', '--port', String(port), '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
  detached: false,
});

const serverReady = await waitForServer(base);
results.push({ name: '预览服务', ok: serverReady });
if (!serverReady) {
  log(`预览服务在 30 秒内未就绪（${base}）。`);
  stopPreview();
  report();
  process.exit(1);
}
log(`预览服务已就绪：${base}`);

// ---------- 4. 逻辑测试 ----------
hr('4 / 5  逻辑测试');
for (const t of LOGIC_TESTS) {
  log(`\n--- ${t.name} (${t.file}) ---`);
  const ok = run('npx', ['tsx', t.file]);
  results.push({ name: t.name, ok });
}

// ---------- 5. 浏览器测试 ----------
hr('5 / 5  浏览器测试（真实 Chromium）');
for (const t of BROWSER_TESTS) {
  log(`\n--- ${t.name} (${t.file}) ---`);
  const ok = run('node', [t.file, base]);
  results.push({ name: t.name, ok });
}

stopPreview();
report();
process.exit(results.every((r) => r.ok) ? 0 : 1);

function report() {
  hr('验证结果汇总');
  for (const r of results) {
    log(`  ${r.ok ? '✓ 通过' : '✗ 失败'}   ${r.name}`);
  }
  const failed = results.filter((r) => !r.ok);
  log('');
  if (failed.length === 0) {
    log(`  全部 ${results.length} 项通过。`);
  } else {
    log(`  ${failed.length} / ${results.length} 项未通过：${failed.map((r) => r.name).join('、')}`);
  }
  log('');
}
