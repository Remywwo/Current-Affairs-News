/**
 * 卡片正文截断回归测试（React 版）
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
 * 与旧版的差异：不再用 DOM 桩 eval app.js，改用 react-dom/server 做
 * 服务端渲染 —— 拿到的是 React 组件真实产出的 HTML。
 *
 * 用法：node scripts/truncate-test.mjs
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const LIMIT = 300;

let pass = 0, fail = 0;
function assert(cond, label, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? '  →  ' + detail : ''}`); }
}

const S = readJSON('src/data/speeches.json');
const N = readJSON('src/data/news.json');
const L = readJSON('src/data/law-knowledge.json');

const { SpeechCard, NewsCard, LawCard } = await import('../src/components/Cards.tsx');
const { MAX_CARD_CHARS } = await import('../src/lib/utils.ts');

// ---------- HTML 解析辅助 ----------
const stripTags = (s) => s.replace(/<[^>]+>/g, '');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const grabAll = (html, re) => {
  const out = []; let m;
  while ((m = re.exec(html))) out.push(unesc(stripTags(m[1])).trim());
  return out;
};
const grabLi = (html) => {
  const ul = (html.match(/<ul class="bullets"[^>]*>([\s\S]*?)<\/ul>/) || [, ''])[1];
  return grabAll(ul, /<li[^>]*>([\s\S]*?)<\/li>/g);
};
const isPrefix = (shown, source) => {
  const s = shown.endsWith('…') ? shown.slice(0, -1) : shown;
  return source.startsWith(s);
};
const render = (el) => renderToStaticMarkup(el);

// ---------- 1. 常量与实现 ----------
console.log('\n【1】截断预算常量');
assert(MAX_CARD_CHARS === LIMIT, `MAX_CARD_CHARS = ${MAX_CARD_CHARS}（期望 ${LIMIT}）`);

// ---------- 2. 讲话卡片 ----------
console.log('\n【2】讲话卡片');
{
  let over = 0, worst = 0, worstTitle = '', missingTip = 0, wrongTip = 0, badPrefix = 0;
  for (const it of S.items) {
    const h = render(React.createElement(SpeechCard, { item: it }));
    const kps = (it.keyPoints || []).filter(p => p);
    const quote = it.quote || '';
    const rawLen = kps.reduce((a, b) => a + b.length, 0) + quote.length;
    const shownKps = grabLi(h);
    const shownQuote = (h.match(/<blockquote class="quote"[^>]*>([\s\S]*?)<\/blockquote>/) || [, ''])[1];
    const shownQuoteTxt = unesc(stripTags(shownQuote)).trim();
    const total = shownKps.reduce((a, b) => a + b.length, 0) + shownQuoteTxt.length;
    if (total > LIMIT) over++;
    if (total > worst) { worst = total; worstTitle = (it.title || '').slice(0, 28); }
    const hasTip = h.includes('trunc-tip');
    if (rawLen > LIMIT && !hasTip) missingTip++;
    if (rawLen <= LIMIT && hasTip) wrongTip++;
    for (let i = 0; i < shownKps.length && i < kps.length; i++) {
      if (!isPrefix(shownKps[i], kps[i])) badPrefix++;
    }
    if (shownQuoteTxt && quote && !isPrefix(shownQuoteTxt, quote)) badPrefix++;
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
  assert(badPrefix === 0, '展示文本均为源文本前缀（未篡改）', `${badPrefix} 处不符`);
}

// ---------- 3. 新闻卡片 ----------
console.log('\n【3】新闻卡片');
{
  let over = 0, worst = 0, worstTitle = '', missingTip = 0, wrongTip = 0, badPrefix = 0;
  for (const it of N.items) {
    const h = render(React.createElement(NewsCard, { item: it }));
    const summary = it.summary || '';
    const shown = grabAll(h, /<(?:p|div) class="summary"[^>]*>([\s\S]*?)<\/(?:p|div)>/g)[0] || '';
    if (shown.length > LIMIT) over++;
    if (shown.length > worst) { worst = shown.length; worstTitle = (it.title || '').slice(0, 28); }
    const hasTip = h.includes('trunc-tip');
    if (summary.length > LIMIT && !hasTip) missingTip++;
    if (summary.length <= LIMIT && hasTip) wrongTip++;
    if (!isPrefix(shown, summary)) badPrefix++;
    if (summary.length <= LIMIT && shown !== summary) badPrefix++;
  }
  assert(over === 0, `全部 ${N.items.length} 张卡片正文 ≤ ${LIMIT} 字`, `${over} 张超限`);
  assert(worst <= LIMIT, `最大正文 ${worst} 字`, worstTitle);
  assert(missingTip === 0, '超长卡片均有「已截断」提示', `漏 ${missingTip} 张`);
  assert(wrongTip === 0, '未超长卡片无多余截断提示', `误报 ${wrongTip} 张`);
  assert(badPrefix === 0, '展示文本均为源文本前缀（未篡改）', `${badPrefix} 处不符`);
}

// ---------- 4. 法条卡片 ----------
// 法条卡的结构与讲话卡不同：正文是 content（散文，<p class="summary">），
// 要点标签在 <div class="kp"> 里用 <span> 承载，两者共享 300 字预算。
console.log('\n【4】法条卡片');
{
  let over = 0, worst = 0, worstTitle = '', missingTip = 0, wrongTip = 0, badPrefix = 0;
  for (const it of L.items) {
    const h = render(React.createElement(LawCard, { item: it }));
    const kps = (it.keyPoints ?? []).filter(p => p);
    const content = it.content || '';

    // 展示层：正文段落 + 要点标签
    const shownContent = grabAll(h, /<p class="summary"[^>]*>([\s\S]*?)<\/p>/g)[0] || '';
    const shownKps = grabAll(h, /<div class="kp"[^>]*>([\s\S]*?)<\/div>/g).length
      ? grabAll((h.match(/<div class="kp"[^>]*>([\s\S]*?)<\/div>/) || [, ''])[1], /<span[^>]*>([\s\S]*?)<\/span>/g)
      : [];

    const total = shownContent.length + shownKps.reduce((a, b) => a + b.length, 0);
    if (total > LIMIT) over++;
    if (total > worst) { worst = total; worstTitle = (it.title || '').slice(0, 28); }

    // 截断提示：原始总量超预算才该出现
    const rawLen = content.length + kps.reduce((a, b) => a + b.length, 0);
    const hasTip = h.includes('trunc-tip');
    if (rawLen > LIMIT && !hasTip) missingTip++;
    if (rawLen <= LIMIT && hasTip) wrongTip++;

    // 前缀校验：展示的每一段必须是源文本前缀
    if (content && !isPrefix(shownContent, content)) badPrefix++;
    for (let i = 0; i < shownKps.length && i < kps.length; i++) {
      if (!isPrefix(shownKps[i], kps[i])) badPrefix++;
    }
    // 未超长时必须完整展示
    if (rawLen <= LIMIT) {
      if (shownContent !== content) badPrefix++;
      if (shownKps.join('') !== kps.join('')) badPrefix++;
    }
  }
  assert(over === 0, `全部 ${L.items.length} 张卡片正文 ≤ ${LIMIT} 字`, `${over} 张超限`);
  assert(worst <= LIMIT, `最大正文 ${worst} 字`, worstTitle);
  assert(missingTip === 0, '超长卡片均有「已截断」提示', `漏 ${missingTip} 张`);
  assert(wrongTip === 0, '未超长卡片无多余截断提示', `误报 ${wrongTip} 张`);
  assert(badPrefix === 0, '展示文本均为源文本前缀（未篡改）', `${badPrefix} 处不符`);
}

console.log(`\n  ${pass} 项通过 / ${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
