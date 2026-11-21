/**
 * 渲染冒烟测试 —— 用最小 DOM 桩真实执行 app.js 的各视图渲染函数，
 * 捕获运行期错误（如未声明变量）。
 *
 * 背景：node --check 只能查语法，查不出 "s is not defined" 这类运行期错误。
 * 本测试用真实数据跑一遍所有视图，确保不抛异常。
 *
 * 数据直接读本地文件，不需要启动 HTTP 服务 —— 改前端后随时可跑。
 * 用法：node scripts/render-test.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// ---------- 最小 DOM 桩 ----------
class El {
  constructor(tag){ this.tagName=(tag||'div').toUpperCase(); this.children=[]; this.style={};
    this.classList={ _s:new Set(), add:(c)=>this.classList._s.add(c), remove:(c)=>this.classList._s.delete(c),
      toggle:(c,f)=>f?this.classList._s.add(c):this.classList._s.delete(c), contains:(c)=>this.classList._s.has(c) };
    this._html=''; this._h=200; this.textContent=''; this.value=''; }
  set innerHTML(v){ this._html=v; this.children=[]; }
  get innerHTML(){ return this._html; }
  set textContent(v){ this._tc=String(v); }
  get textContent(){ return this._tc != null ? this._tc : this._html.replace(/<[^>]+>/g,''); }
  appendChild(c){ this.children.push(c); return c; }
  addEventListener(){} removeEventListener(){}
  querySelector(){ return null; } querySelectorAll(){ return []; }
  getBoundingClientRect(){ return {height:this._h,width:340,top:0,left:0}; }
  setAttribute(k,v){ this[k]=v; } getAttribute(k){ return this[k]; }
  focus(){} setSelectionRange(){}
}
const appEl=new El('main'); appEl.id='app';
const navEls=[];['/','/speeches','/news','/law'].forEach(r=>{const a=new El('a');a.setAttribute('data-route',r);navEls.push(a);});
const gridHost=new El('div');
global.getComputedStyle=()=>({gridTemplateColumns:'340px 340px 340px'});
global.document={
  querySelector:(s)=> s==='#app'?appEl : s==='#themeToggle'?new El('button') : s==='#siteNav'?new El('nav') : null,
  querySelectorAll:(s)=>{
    if(s==='#siteNav a') return navEls;
    if(s==='.grid.cols-2:not(.grid-even)') return [gridHost];
    if(s==='[data-chip]') return [];
    return [];
  },
  createElement:(t)=>new El(t),
  documentElement:{ setAttribute(){}, getAttribute(){return 'light'} },
  body:new El('body'), fonts:null,
};
global.window={addEventListener(){},scrollY:0,scrollTo(){},innerWidth:1400};
global.localStorage={getItem(){return null},setItem(){}};
global.location={hash:'#/'};
const _st=globalThis.setTimeout, _ct=globalThis.clearTimeout;
global.setTimeout=(fn,ms)=>_st(fn,0); global.clearTimeout=(id)=>_ct(id);
global.history={replaceState(){}};

// fetch 返回真实数据（直接读本地文件，无需起服务）
const S=readJSON('data/speeches.json');
const N=readJSON('data/news.json');
const L=readJSON('data/law-knowledge.json');
global.fetch=(u)=>Promise.resolve({json:async()=> u.includes('speeches')?S : u.includes('news')?N : L});

// ---------- 载入并执行 ----------
let src=fs.readFileSync(path.join(ROOT,'assets/app.js'),'utf8');
src=src.replace('})();','global.__t={render:render,viewHome:viewHome,viewSpeeches:viewSpeeches,viewNews:viewNews,viewLaw:viewLaw,viewSourcesSection:viewSourcesSection};})();');
eval(src);
await new Promise(r=>_st(r,600));

// ---------- 逐视图渲染，捕获任何运行时异常 ----------
const routes=[['/', 'viewHome'],['/speeches','viewSpeeches'],['/news','viewNews'],['/law','viewLaw']];
let fail=0;
for(const [label,fn] of routes){
  try{
    const html=global.__t[fn]();
    const len=html.length;
    console.log(`  PASS  ${label.padEnd(12)} 渲染成功  ${len} 字符`);
  }catch(e){
    console.log(`  FAIL  ${label.padEnd(12)} ${e.message}`);
    console.log(`        ${(e.stack||'').split('\n')[1]||''}`);
    fail++;
  }
}
try{
  const html=global.__t.viewSourcesSection();
  console.log(`  PASS  来源区块      渲染成功  ${html.length} 字符`);
}catch(e){
  console.log(`  FAIL  来源区块      ${e.message}`);
  console.log(`        ${(e.stack||'').split('\n')[1]||''}`);
  fail++;
}
process.exit(fail?1:0);
