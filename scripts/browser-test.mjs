/**
 * 真实浏览器渲染验证 —— 用 Chromium 实际加载页面，检查：
 *   1. 四个路由都能正常渲染（不是白屏）
 *   2. 关键内容存在（标题、卡片、页脚）
 *   3. 卡片正文不超过 300 字
 *   4. 瀑布流卡片间距正确、无重叠
 *   5. 搜索框能输入中文（模拟 IME 组合输入）
 *   6. 深浅色主题切换正常
 *   7. 控制台无错误
 *
 * 用法：node scripts/browser-test.mjs [地址]
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const BASE = process.argv[2] || 'http://127.0.0.1:5173/';

let pass = 0, fail = 0;
function assert(cond, label, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? '  →  ' + detail : ''}`); }
}

function findChromium() {
  const candidates = [];
  const cache = path.join(process.env.HOME || '', 'Library/Caches/ms-playwright');
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache).sort().reverse()) {
      if (!d.startsWith('chromium-')) continue;
      const p = path.join(cache, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium');
      if (fs.existsSync(p)) candidates.push(p);
      const h = path.join(cache, d, 'chrome-mac/headless_shell');
      if (fs.existsSync(h)) candidates.push(h);
      const l = path.join(cache, d, 'chrome-linux/chrome');
      if (fs.existsSync(l)) candidates.push(l);
    }
  }
  candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  return candidates.find((p) => fs.existsSync(p));
}

const executablePath = findChromium();
if (!executablePath) {
  console.error('  未找到可用的 Chromium/Chrome');
  process.exit(2);
}
console.log(`  浏览器: ${executablePath}\n  地址: ${BASE}\n`);

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

// ---------- 1. 四个路由渲染 ----------
console.log('【1】四个路由渲染');
const routes = [
  ['#/', '总览', '最新讲话与指示'],
  ['#/speeches', '讲话与指示', '讲话与重要指示'],
  ['#/news', '时政新闻', '最新时政新闻'],
  ['#/law', '执法常识', '国考·省考执法类常识'],
];
for (const [hash, label, expect] of routes) {
  await page.goto(BASE + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const bodyText = (await page.textContent('body')) || '';
  const cards = await page.locator('article.card').count();
  const ok = bodyText.includes(expect) && cards > 0;
  assert(ok, `${label} 渲染正常（${cards} 张卡片）`, `未找到「${expect}」`);
}

// ---------- 2. 关键内容 ----------
console.log('\n【2】关键内容');
await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
assert((await page.locator('.brand-mark').textContent()) === '时', 'brand-mark 为「时」');
assert((await page.locator('.site-footer .footer-grid h4').count()) >= 3, '页脚三栏说明存在');
assert((await page.locator('.site-footer .footer-sources').count()) === 1, '页脚数据来源清单存在');
assert((await page.locator('#siteNav a').count()) === 4, '导航 4 个入口');
assert((await page.locator('.notice').count()) > 0, '使用前必读提示存在');
assert((await page.locator('.trunc-tip').count()) > 0, '截断提示存在');

// ---------- 3. 卡片正文 ≤ 300 字 ----------
console.log('\n【3】卡片正文限长（≤300 字）');
{
  let over = 0, max = 0, checked = 0;
  for (const [hash] of routes) {
    await page.goto(BASE + hash, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const lens = await page.evaluate(() => {
      const out = [];
      for (const art of document.querySelectorAll('article.card')) {
        let n = 0;
        for (const el of art.querySelectorAll('.bullets li, .summary, .quote, .kp span')) {
          n += (el.textContent || '').trim().length;
        }
        out.push(n);
      }
      return out;
    });
    for (const L of lens) {
      checked++;
      if (L > max) max = L;
      if (L > 300) over++;
    }
  }
  assert(over === 0, `全部 ${checked} 张卡片正文 ≤ 300 字`, `${over} 张超限`);
  assert(max <= 300, `最大正文 ${max} 字`);
}

// ---------- 4. 瀑布流几何 ----------
console.log('\n【4】瀑布流布局');
{
  await page.goto(BASE + '#/speeches', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const geo = await page.evaluate(() => {
    const grid = document.querySelector('.grid.cols-2:not(.grid-even)');
    if (!grid) return null;
    const cards = [...grid.children];
    const rects = cards.map((c) => c.getBoundingClientRect());
    // 同列（x 相同）相邻卡片的垂直间距
    const byCol = {};
    rects.forEach((r, i) => {
      const key = Math.round(r.x);
      (byCol[key] ||= []).push(r);
    });
    let minGap = Infinity, maxGap = -Infinity, overlap = 0;
    for (const col of Object.values(byCol)) {
      col.sort((a, b) => a.top - b.top);
      for (let i = 1; i < col.length; i++) {
        const gap = col[i].top - col[i - 1].bottom;
        if (gap < 0) overlap++;
        if (gap < minGap) minGap = gap;
        if (gap > maxGap) maxGap = gap;
      }
    }
    return { cards: cards.length, minGap, maxGap, overlap };
  });
  assert(geo !== null, '找到瀑布流网格');
  assert(geo.cards > 0, `渲染了 ${geo?.cards} 张卡片`);
  assert(geo.overlap === 0, '同列卡片无重叠', `重叠 ${geo?.overlap} 处`);
  assert(Math.abs((geo.minGap ?? 0) - 14) <= 1.5, `最小间距 ${geo?.minGap?.toFixed(1)}px（目标 14px）`);
  assert(Math.abs((geo.maxGap ?? 0) - 14) <= 1.5, `最大间距 ${geo?.maxGap?.toFixed(1)}px（目标 14px）`);
}

// ---------- 5. 中文输入（IME） ----------
console.log('\n【5】中文输入（IME 组合输入）');
{
  await page.goto(BASE + '#/speeches', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const input = page.locator('#spQ');
  await input.click();

  // 真实 IME 事件序列：compositionstart → 拼音 input → compositionend(中文) → input
  await page.evaluate(() => {
    const el = document.querySelector('#spQ');
    el.focus();
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    el.value = 'zhongwen';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }));
    el.value = '中文';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(700);

  const val = await input.inputValue();
  assert(val === '中文', `输入框内容为「${val}」`);

  const cards = await page.locator('article.card').count();
  const hint = await page.locator('.section-head .hint').first().textContent();
  assert(cards > 0 && cards < 134, `中文检索生效（命中 ${cards} 条）`, hint || '');

  // 焦点是否保留（组合结束后不应丢失焦点）
  const focused = await page.evaluate(() => document.activeElement?.id || '');
  assert(focused === 'spQ', `焦点保持在搜索框（当前: ${focused || '无'}）`);
}

// ---------- 6. 主题切换 ----------
console.log('\n【6】深浅色主题');
{
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.locator('#themeToggle').click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert(before !== after, `主题切换生效（${before} → ${after})`);

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert(bg !== 'rgba(0, 0, 0, 0)', `背景色已应用: ${bg}`);
}

// ---------- 7. 控制台无错误 ----------
console.log('\n【7】控制台');
assert(consoleErrors.length === 0, '无 JS 错误', consoleErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n  ${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} 项通过 / ${fail} 项失败\n`);
process.exit(fail ? 1 : 0);
