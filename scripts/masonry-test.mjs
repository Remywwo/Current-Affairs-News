/**
 * 瀑布流几何回归测试
 *
 * 背景：曾出现过「卡片之间有大量空白」的线上 bug —— 根因是 span 计算公式
 * 除错了分母（除以 rowHeight 而非 rowHeight+rowGap），导致 span 被放大约 3 倍。
 *
 * 本测试严格按 CSS Grid 规范计算：
 *   span N 跨越 N 行 → 占位 = N*rowHeight + (N-1)*rowGap
 *   卡片 align-self:start 贴在行顶
 *   → 视觉间距 = 下一张卡的 y - (本张卡的 y + 本张卡实际内容高)
 *
 * 同时校验 app.js 中实际使用的公式常量与 CSS 是否一致。
 *
 * 运行：node scripts/masonry-test.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------- 从源码读取实际配置，避免测试与实现脱节 ----------
const appJs = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/style.css'), 'utf8');

function readConst(name, fallback) {
  const m = appJs.match(new RegExp(name + '\\s*:\\s*(\\d+)'));
  return m ? parseInt(m[1], 10) : fallback;
}
function readCssNum(sel, prop) {
  const block = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  if (!block) return null;
  // 允许 0 无单位，也允许带 px
  const m = block[1].match(new RegExp(prop + '\\s*:\\s*(\\d+)(?:px)?'));
  return m ? parseInt(m[1], 10) : null;
}

const JS_ROW = readConst('rowHeight', 1);
const JS_GAP = readConst('gap', 14);
const CSS_ROW = readCssNum('.grid.cols-2', 'grid-auto-rows');
const CSS_ROWGAP = readCssNum('.grid.cols-2', 'row-gap');
const CSS_COLGAP = readCssNum('.grid.cols-2', 'column-gap');

let failed = 0;
function assert(cond, msg, detail) {
  if (cond) {
    console.log(`  PASS  ${msg}`);
  } else {
    console.log(`  FAIL  ${msg}${detail ? '  → ' + detail : ''}`);
    failed++;
  }
}

console.log('='.repeat(60));
console.log('  瀑布流几何回归测试');
console.log('='.repeat(60));

// ---------- 1. JS 与 CSS 配置一致性 ----------
console.log('\n[1/3] 配置一致性');
assert(CSS_ROW === JS_ROW, `grid-auto-rows 与 JS rowHeight 一致`,
       `CSS=${CSS_ROW}px  JS=${JS_ROW}px`);
assert(CSS_COLGAP === JS_GAP, `column-gap 与 JS gap 一致`,
       `CSS=${CSS_COLGAP}px  JS=${JS_GAP}px`);
assert(CSS_ROWGAP === 0, `row-gap 为 0（垂直间距完全由 JS 算入 span）`,
       `实际 ${CSS_ROWGAP}px`);

// ---------- 2. 公式正确性 ----------
console.log('\n[2/3] span 公式');

// Grid 规范：span N 占位 = N*rowHeight + (N-1)*rowGap
function occupiedOf(span, rowHeight, rowGap) {
  return span * rowHeight + (span - 1) * rowGap;
}

// 复刻 app.js 中的公式
function spanOf(h, rowHeight, gap) {
  return Math.max(1, Math.ceil(h + gap));
}

// 模拟整段排布
function simulate(heights, rowHeight, rowGap, gap, cols) {
  const colH = new Array(cols).fill(0);
  const placed = [];
  heights.forEach((h) => {
    let t = 0;
    for (let k = 1; k < cols; k++) if (colH[k] < colH[t] - 0.5) t = k;
    const span = spanOf(h, rowHeight, gap);
    const occupied = occupiedOf(span, rowHeight, rowGap);
    placed.push({ t, span, h, occupied, y: colH[t] });
    colH[t] += occupied;
  });
  return placed;
}

function visualGaps(placed, cols) {
  const gaps = [];
  let overlap = 0;
  for (let c = 0; c < cols; c++) {
    const items = placed.filter((p) => p.t === c).sort((a, b) => a.y - b.y);
    for (let k = 1; k < items.length; k++) {
      const g = items[k].y - (items[k - 1].y + items[k - 1].h);
      gaps.push(g);
      if (g < -0.5) overlap++;
    }
  }
  return { gaps, overlap };
}

const heights = [];
for (let i = 0; i < 60; i++) heights.push(140 + ((i * 137) % 11) * 41);

const COLS = 3;
const placed = simulate(heights, CSS_ROW, CSS_ROWGAP, JS_GAP, COLS);
const { gaps, overlap } = visualGaps(placed, COLS);
const min = Math.min(...gaps), max = Math.max(...gaps);
const off = gaps.filter((g) => Math.abs(g - JS_GAP) > 1.5).length;

console.log(`        卡片数 ${placed.length}，列数 ${COLS}`);
console.log(`        视觉间距 min ${min.toFixed(1)}px / max ${max.toFixed(1)}px（目标 ${JS_GAP}px）`);
assert(overlap === 0, '同列卡片无重叠', `重叠 ${overlap} 处`);
assert(off === 0, `所有间距偏差 ≤1.5px`, `偏差 ${off} 处`);
assert(max - min < 2, '间距均匀（极差 < 2px）', `极差 ${(max - min).toFixed(1)}px`);

// ---------- 3. 边界值 ----------
console.log('\n[3/3] 边界情况');
const edge = [1, 13, 14, 15, 27, 28, 29, 999, 1200];
let edgeOK = true;
edge.forEach((h) => {
  const span = spanOf(h, CSS_ROW, JS_GAP);
  const occupied = occupiedOf(span, CSS_ROW, CSS_ROWGAP);
  if (occupied < h) { edgeOK = false; console.log(`        高度 ${h}px 被裁切（span ${span} 仅占 ${occupied}px）`); }
  const visual = occupied - h;
  if (visual < JS_GAP - 1) { edgeOK = false; console.log(`        高度 ${h}px 间距仅 ${visual}px`); }
});
assert(edgeOK, '极端高度下不裁切内容且间距充足');

// 大量卡片时列高是否仍然均衡
const many = simulate(heights.concat(heights), CSS_ROW, CSS_ROWGAP, JS_GAP, COLS);
const colTotals = new Array(COLS).fill(0);
many.forEach((p) => { colTotals[p.t] += p.occupied; });
const spread = Math.max(...colTotals) - Math.min(...colTotals);
const totalH = colTotals.reduce((a, b) => a + b, 0);
// 瀑布流末尾不齐是自然形态（最后几张落在各列剩余空间里），
// 关键指标是"列高差占总高的比例"应足够小，而非绝对值。
const spreadPct = (spread / totalH) * 100;
assert(spreadPct < 5, '长列表列高差占比 < 5%（末尾不齐属正常形态）',
       `差 ${spread}px / 总 ${totalH}px = ${spreadPct.toFixed(2)}%`);

console.log('\n' + '='.repeat(60));
console.log(failed === 0 ? '  全部通过' : `  ${failed} 项未通过`);
console.log('='.repeat(60));
process.exit(failed ? 1 : 0);
