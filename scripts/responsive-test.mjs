/**
 * 响应式回归测试 —— 在多种视口宽度下检查列数与布局。
 *
 * 背景：站点内容卡片用 CSS Grid 自适应列数（repeat(auto-fill, minmax(320px,1fr))），
 * 窄屏时靠媒体查询降为单列。这里把「哪些宽度该是几列」固化下来，
 * 避免以后改样式时不小心在手机上又变回多列。
 *
 * 检查项：
 *   1. 各断点下的实际列数是否符合预期
 *   2. 无横向溢出（页面不应出现左右滚动条）
 *   3. 卡片之间无重叠、垂直间距符合规范
 *   4. 窄屏下卡片限宽居中（不铺满超宽屏）
 *
 * 用法：node scripts/responsive-test.mjs [地址]
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';

let pass = 0, fail = 0;
function assert(cond, label, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? '  →  ' + detail : ''}`); }
}

// ---------- 找浏览器 ----------
function findChromium() {
  const candidates = [
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH] : []),
    // macOS（本机）
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Linux（GitHub Actions runner 预装）
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const cache = path.join(process.env.HOME || '', 'Library/Caches/ms-playwright');
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache)) {
      if (!d.startsWith('chromium-')) continue;
      const p = path.join(cache, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium');
      if (fs.existsSync(p)) candidates.push(p);
    }
  }
  return candidates.find((p) => fs.existsSync(p));
}

const executablePath = findChromium();
if (!executablePath) {
  console.error('  未找到可用浏览器，跳过响应式测试');
  process.exit(2);
}

// 断点预期：宽度 → 期望列数
//   ≤900px 单列（手机横屏、平板竖屏）
//   901~1279px 两列
//   ≥1280px 三列
const CASES = [
  [320, 1, '超窄屏'],
  [375, 1, '手机竖屏'],
  [414, 1, '大屏手机'],
  [640, 1, '窄平板'],
  [768, 1, '平板竖屏'],
  [820, 1, '平板竖屏+'],
  [900, 1, '单列上限'],
  [1024, 2, '小笔记本'],
  [1280, 3, '桌面'],
  [1440, 3, '大屏桌面'],
  [1600, 3, '超宽屏（应封顶 3 列）'],
];

console.log('\n【1】列数与断点');
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();

for (const [w, expectCols, label] of CASES) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(BASE + '#/speeches', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => {
    const grid = document.querySelector('.grid.cols-2:not(.grid-even)');
    if (!grid) return null;
    const de = document.documentElement;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter((s) => s && s !== 'none').length;
    const cards = [...grid.querySelectorAll('.card')];

    // 同列相邻卡片的垂直间距
    const byCol = {};
    cards.forEach((c) => {
      const col = getComputedStyle(c).gridColumnStart;
      (byCol[col] ||= []).push(c.getBoundingClientRect());
    });
    const gaps = [];
    let overlap = 0;
    Object.values(byCol).forEach((list) => {
      list.sort((a, b) => a.top - b.top);
      for (let i = 1; i < list.length; i++) {
        const g = list[i].top - (list[i - 1].top + list[i - 1].height);
        gaps.push(g);
        if (g < -0.5) overlap++;
      }
    });

    return {
      cols,
      cards: cards.length,
      gaps,
      overlap,
      overflow: de.scrollWidth > de.clientWidth,
      maxCardW: cards.length ? Math.max(...cards.map((c) => c.getBoundingClientRect().width)) : 0,
      viewportW: de.clientWidth,
    };
  });

  if (!info) {
    assert(false, `${w}px 列数为 ${expectCols}（${label}）`, '未找到瀑布流网格');
    continue;
  }

  assert(info.cols === expectCols, `${w}px → ${expectCols} 列（${label}）`, `实际 ${info.cols} 列`);
  assert(!info.overflow, `${w}px 无横向溢出`, `${info.viewportW}px`);
  assert(info.overlap === 0, `${w}px 卡片无重叠`, `${info.overlap} 处`);

  if (info.gaps.length) {
    const min = Math.min(...info.gaps), max = Math.max(...info.gaps);
    assert(min >= 12 && max <= 17, `${w}px 垂直间距在 14px 附近`,
      `${min.toFixed(1)}~${max.toFixed(1)}px`);
  }
}

// ---------- 2. 窄屏卡片限宽 ----------
console.log('\n【2】窄屏限宽居中');
for (const w of [768, 900]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(BASE + '#/speeches', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const card = document.querySelector('.grid.cols-2:not(.grid-even) > .card');
    const rect = card.getBoundingClientRect();
    const grid = card.parentElement.getBoundingClientRect();
    return { cardW: rect.width, gridW: grid.width, left: rect.left, gridLeft: grid.left };
  });
  // 单列限宽时，卡片应明显窄于容器，且左右居中
  const centered = Math.abs((r.left - r.gridLeft) - (r.gridW - r.cardW) / 2) < 4;
  assert(r.cardW <= 760, `${w}px 卡片限宽（${Math.round(r.cardW)}px ≤ 760px）`, `${Math.round(r.cardW)}px`);
  assert(centered, `${w}px 卡片居中`, `左偏移 ${Math.round(r.left - r.gridLeft)}px`);
}

// ---------- 3. 缩放后重排（隐式列陷阱） ----------
// 曾出现过的 bug：从宽屏（3 列）缩到窄屏（1 列）后，卡片被压成 42px。
// 根因是上一轮布局写入的内联 grid-column 指向了不存在的列，
// CSS Grid 创建隐式列，而 getComputedStyle 返回的已使用值包含隐式轨道，
// 于是列数被误判，循环往复。
// 这里专门复现「先宽后窄」的顺序。
console.log('\n【3】缩放后重排');
for (const [from, to, expectCols] of [[1600, 768, 1], [1440, 375, 1], [1280, 900, 1], [1024, 375, 1]]) {
  await page.setViewportSize({ width: from, height: 900 });
  await page.goto(BASE + '#/speeches', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.setViewportSize({ width: to, height: 900 });
  await page.waitForTimeout(700); // 等 resize 防抖 + rAF 重排完成

  const r = await page.evaluate(() => {
    const grid = document.querySelector('.grid.cols-2:not(.grid-even)');
    const cards = [...grid.querySelectorAll('.card')];
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter((s) => s && s !== 'none').length;
    const widths = cards.map((c) => c.getBoundingClientRect().width);
    return {
      cols,
      minW: Math.min(...widths),
      maxW: Math.max(...widths),
      // 卡片宽度若远小于容器，说明被塞进了塌缩的隐式列
      gridW: grid.getBoundingClientRect().width,
    };
  });

  assert(r.cols === expectCols, `${from}px → ${to}px 重排后 ${expectCols} 列`, `实际 ${r.cols} 列（${r.cols ? r.cols + ' 列' : ''}）`);
  assert(r.minW > 100, `${from}px → ${to}px 卡片未塌缩`, `最窄仅 ${Math.round(r.minW)}px`);
}

// ---------- 4. 各路由窄屏无溢出 ----------
console.log('\n【4】各路由窄屏布局');
for (const hash of ['#/', '#/speeches', '#/news', '#/law']) {
  for (const w of [375, 768]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + hash, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      return {
        overflow: de.scrollWidth > de.clientWidth,
        evenCols: (() => {
          const g = document.querySelector('.grid-even');
          return g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter((s) => s && s !== 'none').length : 0;
        })(),
        footCols: (() => {
          const g = document.querySelector('.footer-grid');
          return g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter((s) => s && s !== 'none').length : 0;
        })(),
      };
    });
    assert(!r.overflow, `${hash} @${w}px 无横向溢出`);
    if (r.evenCols > 0) assert(r.evenCols === 1, `${hash} @${w}px 等高组单列`, `${r.evenCols} 列`);
    if (r.footCols > 0) assert(r.footCols === 1, `${hash} @${w}px 页脚单列`, `${r.footCols} 列`);
  }
}

await browser.close();

console.log(`\n  ${pass} 项通过 / ${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
