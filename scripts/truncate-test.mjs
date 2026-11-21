/**
 * 卡片正文截断回归测试
 *
 * 规则：卡片「正文」合计最多 300 字（要点 / 摘要 / 金句引用 / 要点标签），
 *      标题、分类标签、日期来源、发布主体、法条依据等元信息不计入。
 *      超出部分在展示层截断并加省略号，JSON 原始数据保持完整。
 *
 * 本测试**独立于实现**重新核算：
 *   1. 每张卡片的正文实际字数必须 ≤ 300
 *   2. 源数据超长的卡片必须出现「已截断」提示
 *   3. 源数据不超长的卡片必须完整展示、且无截断提示
 *   4. 展示的每一段必须是源文本的前缀（不篡改、不编造）
 *
 * 用法：node scripts/truncate-test.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const LIMIT = 300;

let pass = 0, fail = 0;
function assert(cond, label, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? '  →  ' + detail : ''}`); }
}

// ---------- 最小 DOM 桩（只需够卡片渲染函数用） ----------
class El {
  constructor(tag) { this.tagName = (tag || 'div').toUpperCase(); this.children = []; this.style = {};
    this.classList = { _s: new Set(), add: c => this.classList._s.add(c), remove: c => this.classList._s.delete(c),
      toggle: (c, f) => f ? this.classList._s.add(c) : this.classList._s.delete(c), contains: c => this.classList._s.has(c) };
    this._html = ''; this._h = 200; this._tc = null; this.textContent = ''; this.value = ''; }
  set innerHTML(v) { this._html = v; this.children = []; }
  get innerHTML() { return this._html; }
  set textContent(v) { this._tc = String(v); }
  get textContent() { return this._tc != null ? this._tc : this._html.replace(/<[^>]+>/g, ''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener() {} removeEventListener() {}
  querySelector() { return null; } querySelectorAll() { return []; }
  getBoundingClientRect() { return { height: this._h, width: 340, top: 0, left: 0 }; }
  setAttribute(k, v) { this[k] = v; } getAttribute(k) { return this[k]; }
  focus() {} setSelectionRange() {}
}
global.getComputedStyle = () => ({ gridTemplateColumns: '340px' });
global.document = {
  querySelector: (s) => (s === '#app' ? new El('main') : s === '#themeToggle' ? new El('button') : s === '#siteNav' ? new El('nav') : null),
  querySelectorAll: () => [],
  createElement: (t) => new El(t),
  documentElement: { setAttribute() {}, getAttribute() { return 'light'; } },
  body: new El('body'), fonts: null,
};
global.window = { addEventListener() {}, scrollY: 0, scrollTo() {} };
global.localStorage = { getItem() { return null; }, setItem() {} };
global.location = { hash: '#/' };
global.history = { replaceState() {} };
const _st = globalThis.setTimeout, _ct = globalThis.clearTimeout;
global.setTimeout = (fn) => _st(fn, 0); global.clearTimeout = (id) => _ct(id);
const S = readJSON('data/speeches.json'), N = readJSON('data/news.json'), L = readJSON('data/law-knowledge.json');
global.fetch = (u) => Promise.resolve({ json: async () => (u.includes('speeches') ? S : u.includes('news') ? N : L) });

// ---------- 载入 app.js，暴露卡片函数 ----------
let src = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
src = src.replace('})();', 'global.__c={speechCard:speechCard,newsCard:newsCard,lawCard:lawCard,MAX_CARD_CHARS:MAX_CARD_CHARS};})();');
eval(src);
await new Promise(r => _st(r, 600));

// ---------- HTML 解析辅助 ----------
const stripTags = (s) => s.replace(/<[^>]+>/g, '');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const grabAll = (html, re) => {
  const out = []; let m;
  while ((m = re.exec(html))) out.push(unesc(stripTags(m[1])).trim());
  return out;
};
// 提取 <ul class="bullets"> 内每一项 <li> 的文本（逐条，用于前缀比对）
const grabLi = (html) => {
  const ul = (html.match(/<ul class="bullets">([\s\S]*?)<\/ul>/) || [, ''])[1];
  return grabAll(ul, /<li>([\s\S]*?)<\/li>/g);
};
// 提取 <div class="kp"> 内每一个 <span> 标签的文本（逐个，用于前缀比对）
const grabSpan = (html) => {
  const kp = (html.match(/<div class="kp">([\s\S]*?)<\/div>/) || [, ''])[1];
  return grabAll(kp, /<span>([\s\S]*?)<\/span>/g);
};
const isPrefix = (shown, source) => {
  const s = shown.endsWith('…') ? shown.slice(0, -1) : shown;
  return source.startsWith(s);
};

// ---------- 1. 常量与实现 ----------
console.log('\n【1】截断预算常量');
assert(global.__c.MAX_CARD_CHARS === LIMIT, `MAX_CARD_CHARS = ${global.__c.MAX_CARD_CHARS}（期望 ${LIMIT}）`);

// ---------- 2. 讲话卡片 ----------
console.log('\n【2】讲话卡片');
{
  let over = 0, worst = 0, worstTitle = '', missingTip = 0, wrongTip = 0, badPrefix = 0;
  for (const it of S.items) {
    const html = global.__c.speechCard(it);
    const kps = (it.keyPoints || []).filter(p => p);
    const quote = it.quote || '';
    const rawLen = kps.reduce((a, b) => a + b.length, 0) + quote.length;
    const shownKps = grabLi(html);
    const shownQuote = (html.match(/<blockquote class="quote">([\s\S]*?)<\/blockquote>/) || [, ''])[1];
    const shownQuoteTxt = unesc(stripTags(shownQuote)).trim();
    const total = shownKps.reduce((a, b) => a + b.length, 0) + shownQuoteTxt.length;
    if (total > LIMIT) { over++; }
    if (total > worst) { worst = total; worstTitle = it.title.slice(0, 28); }
    const hasTip = html.includes('trunc-tip');
    if (rawLen > LIMIT && !hasTip) missingTip++;
    if (rawLen <= LIMIT && hasTip) wrongTip++;
    // 每段必须是源文本前缀
    for (let i = 0; i < shownKps.length && i < kps.length; i++) {
      if (!isPrefix(shownKps[i], kps[i])) badPrefix++;
    }
    if (shownQuoteTxt && quote && !isPrefix(shownQuoteTxt, quote)) badPrefix++;
    // 源数据不超长时必须完整展示
    if (rawLen <= LIMIT) {
      const full = kps.join('') + quote;
      const got = shownKps.join('') + shownQuoteTxt;
      if (got !== full) badPrefix++;
    }
  }
  assert(over === 0, `全部 ${S.items.length} 张卡片正文 ≤ ${LIMIT} 字`, `${over} 张超限`);
  assert(worst <= LIMIT, `最大正文 ${worst} 字`, worstTitle);
  assert(missingTip === 0, '超长卡片均有「已截断」提示', `漏 ${missingTip} 张`);
  assert(wrongTip === 0, '未超长卡片无多余截断提示', `误报 ${wrongTip} 张`);
  assert(badPrefix === 0, '展示文本均为源文本前缀（未篡改）', `异常 ${badPrefix} 处`);
}

// ---------- 3. 新闻卡片 ----------
console.log('\n【3】新闻卡片');
{
  let over = 0, worst = 0, missingTip = 0, wrongTip = 0, badPrefix = 0;
  for (const it of N.items) {
    const html = global.__c.newsCard(it);
    const summary = it.summary || '';
    const shown = grabAll(html, /<p class="summary">([\s\S]*?)<\/p>/g)[0] || '';
    if (shown.length > LIMIT) over++;
    if (shown.length > worst) worst = shown.length;
    const hasTip = html.includes('trunc-tip');
    if (summary.length > LIMIT && !hasTip) missingTip++;
    if (summary.length <= LIMIT && hasTip) wrongTip++;
    if (!isPrefix(shown, summary)) badPrefix++;
    if (summary.length <= LIMIT && shown !== summary) badPrefix++;
  }
  assert(over === 0, `全部 ${N.items.length} 张卡片摘要 ≤ ${LIMIT} 字`, `${over} 张超限`);
  assert(worst <= LIMIT, `最大摘要 ${worst} 字`);
  assert(missingTip === 0, '超长摘要均有「已截断」提示', `漏 ${missingTip} 张`);
  assert(wrongTip === 0, '未超长摘要无多余提示', `误报 ${wrongTip} 张`);
  assert(badPrefix === 0, '摘要为源文本前缀（未篡改）', `异常 ${badPrefix} 处`);
}

// ---------- 4. 常识卡片 ----------
console.log('\n【4】常识卡片');
{
  let over = 0, worst = 0, worstTitle = '', missingTip = 0, wrongTip = 0, badPrefix = 0;
  for (const it of L.items) {
    const html = global.__c.lawCard(it);
    const content = it.content || '';
    const kps = it.keyPoints || [];
    const rawLen = content.length + kps.reduce((a, b) => a + b.length, 0);
    const shownContent = grabAll(html, /<p class="summary">([\s\S]*?)<\/p>/g)[0] || '';
    const shownKps = grabSpan(html);
    const total = shownContent.length + shownKps.reduce((a, b) => a + b.length, 0);
    if (total > LIMIT) { over++; }
    if (total > worst) { worst = total; worstTitle = it.title.slice(0, 24); }
    const hasTip = html.includes('trunc-tip');
    if (rawLen > LIMIT && !hasTip) missingTip++;
    if (rawLen <= LIMIT && hasTip) wrongTip++;
    if (shownContent && !isPrefix(shownContent, content)) badPrefix++;
    for (let i = 0; i < shownKps.length && i < kps.length; i++) {
      if (!isPrefix(shownKps[i], kps[i])) badPrefix++;
    }
    if (rawLen <= LIMIT) {
      if (shownContent !== content) badPrefix++;
      if (shownKps.join('') !== kps.join('')) badPrefix++;
    }
  }
  assert(over === 0, `全部 ${L.items.length} 张卡片正文 ≤ ${LIMIT} 字`, `${over} 张超限`);
  assert(worst <= LIMIT, `最大正文 ${worst} 字`, worstTitle);
  assert(missingTip === 0, '超长卡片均有「已截断」提示', `漏 ${missingTip} 张`);
  assert(wrongTip === 0, '未超长卡片无多余提示', `误报 ${wrongTip} 张`);
  assert(badPrefix === 0, '正文与标签均为源文本前缀（未篡改）', `异常 ${badPrefix} 处`);
}

// ---------- 5. 截断提示文案 ----------
console.log('\n【5】截断提示文案');
{
  const EXPECT = '正文较长，已截断显示，点击底部原文链接，查看原文';
  const seen = new Set();
  let badText = 0, hasLink = 0;
  const collect = (html) => {
    const m = html.match(/<p class="trunc-tip">([\s\S]*?)<\/p>/);
    if (m) { seen.add(m[1]); if (m[1] !== EXPECT) badText++; if (/<a\s/.test(m[1])) hasLink++; }
  };
  S.items.forEach(it => collect(global.__c.speechCard(it)));
  N.items.forEach(it => collect(global.__c.newsCard(it)));
  L.items.forEach(it => collect(global.__c.lawCard(it)));
  assert(seen.size === 1, `提示文案统一（共 ${seen.size} 种）`, [...seen].join(' | '));
  assert(badText === 0, '所有提示文案与约定一致', `不一致 ${badText} 处`);
  assert(hasLink === 0, '提示内不再内嵌链接（改为指引底部链接）', `仍有链接 ${hasLink} 处`);
  assert([...seen][0] === EXPECT, `文案为「${EXPECT}」`, [...seen][0]);
}

// ---------- 6. 卡片底部确有「原文链接」 ----------
console.log('\n【6】底部原文链接存在（保证提示的指引成立）');
{
  let missS = 0, missN = 0, missL = 0;
  for (const it of S.items) {
    if (!global.__c.speechCard(it).includes('原文链接')) missS++;
  }
  for (const it of N.items) {
    if (!global.__c.newsCard(it).includes('原文链接')) missN++;
  }
  for (const it of L.items) {
    if (!global.__c.lawCard(it).includes('原文链接')) missL++;
  }
  assert(missS === 0, `讲话卡 ${S.items.length} 张均有底部原文链接`, `缺 ${missS} 张`);
  assert(missN === 0, `新闻卡 ${N.items.length} 张均有底部原文链接`, `缺 ${missN} 张`);
  assert(missL === 0, `常识卡 ${L.items.length} 张均有底部原文链接`, `缺 ${missL} 张`);
}

// ---------- 7. 源数据未被截断污染 ----------
console.log('\n【7】源数据完整性（截断只在展示层）');
{
  const full = S.items.some(i => (i.keyPoints || []).reduce((a, b) => a + b.length, 0) > LIMIT);
  const fullL = L.items.some(i => (i.content || '').length > LIMIT);
  assert(full, 'JSON 中讲话要点仍保留完整原文');
  assert(fullL, 'JSON 中常识正文仍保留完整原文');
}

console.log(`\n  ${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} 项通过 / ${fail} 项失败\n`);
process.exit(fail ? 1 : 0);
