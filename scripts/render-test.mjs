/**
 * 渲染冒烟测试（React 版）—— 用 react-dom/server 真实渲染各视图组件，
 * 捕获运行期错误（如未声明变量、props 解构出错）。
 *
 * 背景：node --check 只能查语法，查不出 "s is not defined" 这类运行期错误。
 * 本测试用真实数据跑一遍所有视图，确保不抛异常。
 *
 * 与旧版的差异：旧版用 DOM 桩 eval app.js 的渲染函数；React 版直接
 * 服务端渲染组件 —— 走的是真实的组件代码路径，桩反而容易漏掉问题。
 *
 * 数据直接读本地文件，不需要启动 HTTP 服务 —— 改前端后随时可跑。
 * 用法：npx tsx scripts/render-test.mjs
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const S = readJSON('src/data/speeches.json');
const N = readJSON('src/data/news.json');
const L = readJSON('src/data/law-knowledge.json');
const data = { speeches: S, news: N, law: L };

const { HomeView } = await import('../src/views/HomeView.tsx');
const { SpeechesView } = await import('../src/views/SpeechesView.tsx');
const { NewsView } = await import('../src/views/NewsView.tsx');
const { LawView } = await import('../src/views/LawView.tsx');
const { SourcesSection } = await import('../src/views/SourcesSection.tsx');

let fail = 0;

// ---------- 逐视图渲染，捕获任何运行时异常 ----------
const views = [
  ['总览', HomeView, data],
  ['讲话与指示', SpeechesView, S],
  ['时政新闻', NewsView, N],
  ['执法常识', LawView, L],
  ['来源区块', SourcesSection, data],
];

for (const [label, Comp, props] of views) {
  try {
    const html = renderToStaticMarkup(React.createElement(Comp, { data: props }));
    if (!html || html.length < 50) {
      console.log(`  FAIL  ${label.padEnd(12)} 渲染结果异常（仅 ${html?.length ?? 0} 字符）`);
      fail++;
      continue;
    }
    console.log(`  PASS  ${label.padEnd(12)} 渲染成功  ${html.length} 字符`);
  } catch (e) {
    console.log(`  FAIL  ${label.padEnd(12)} ${e.message}`);
    console.log(`        ${(e.stack || '').split('\n')[1] || ''}`);
    fail++;
  }
}

process.exit(fail ? 1 : 0);
