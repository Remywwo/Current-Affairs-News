import { useEffect, useRef } from 'react';
import type { AppData } from './lib/types';
import { useHashRoute } from './hooks/useHashRoute';
import { useTheme } from './hooks/useTheme';
import { useMasonry } from './hooks/useMasonry';
import { HomeView } from './views/HomeView';
import { SpeechesView } from './views/SpeechesView';
import { NewsView } from './views/NewsView';
import { LawView } from './views/LawView';

const NAV = [
  { route: '/', label: '总览' },
  { route: '/speeches', label: '讲话与指示' },
  { route: '/news', label: '时政新闻' },
  { route: '/law', label: '执法常识' },
];

export function App({ data }: { data: AppData }) {
  const route = useHashRoute();
  const { theme, toggle } = useTheme();
  const { containerRef } = useMasonry<HTMLDivElement>();

  // 切换路由时回到顶部
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route]);

  const s = data.speeches.items.length;
  const n = data.news.items.length;
  const l = data.law?.items.length ?? 0;

  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <a className="brand" href="#/">
            <span className="brand-mark">时</span>
            <span className="brand-text">
              <strong>时政·执法常识学习站</strong>
              <small>全站内容标注时间与官方出处，逐条可溯源</small>
            </span>
          </a>
          <button
            className="theme-toggle"
            id="themeToggle"
            aria-label="切换深浅色主题"
            onClick={toggle}
            title={theme === 'dark' ? '切换为浅色' : '切换为深色'}
          >
            <span className="theme-icon">{theme === 'dark' ? '☀' : '◐'}</span>
            <span className="theme-label">主题</span>
          </button>
        </div>
        <nav className="site-nav" id="siteNav">
          <div className="wrap nav-inner">
            {NAV.map((nav) => (
              <a
                key={nav.route}
                href={'#' + nav.route}
                data-route={nav.route}
                className={route === nav.route ? 'active' : ''}
              >
                {nav.label}
              </a>
            ))}
          </div>
        </nav>
      </header>

      <main id="app" className="wrap" ref={containerRef}>
        {route === '/speeches' && <SpeechesView data={data.speeches} />}
        {route === '/news' && <NewsView data={data.news} />}
        {route === '/law' && <LawView data={data.law} />}
        {route === '/' && <HomeView data={data} />}
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <div className="footer-grid">
            <div>
              <h4>关于本站</h4>
              <p>
                本站是一个<strong>资料汇编工具</strong>，所有条目均摘自新华网等官方渠道，
                每条附发布时间与原文链接，便于自行核对原文。
              </p>
            </div>
            <div>
              <h4>诚实声明</h4>
              <p>
                本站<strong>不生产、不评论、不演绎</strong>任何官方表述。
                要点部分为原文分类摘录，详见每条的出处链接。凡无法从官方源核实的考点，一律不收录。
              </p>
            </div>
            <div>
              <h4>更新机制</h4>
              <p>
                数据快照：<strong id="footUpdated">{data.speeches.meta.updatedAt}</strong>。
                由自动流水线每日增量更新、每周全量体检，抓取来源与核验记录见总览页底部。
                本工具不代替原始文件，引用请以原文为准。
              </p>
            </div>
          </div>
          <div className="footer-sources">
            <h4>数据来源</h4>
            <ul>
              <li>讲话与指示 — 新华网「习近平报道专集」：讲话全文、重要文章、指示批示、致电致信、会议活动、考察调研</li>
              <li>时政新闻 — 新华网「时政联播」「新华法治」</li>
              <li>执法常识 — 全国人大网、中国政府网、最高人民法院、最高人民检察院</li>
            </ul>
            <p className="footer-note">
              全站 <strong>{s + n + l}</strong> 条内容的来源链接已逐条发起 HTTP 请求校验，
              官方直链均可直接打开；少数转载类来源（如政务微信公众号、中新网引述）为正常跳转，
              卡片内已单独标注其来源性质。
            </p>
          </div>
          <p className="footer-bottom">
            本站内容不构成法律意见。涉及具体执法办案，请以现行有效法律文本及官方解释为准。
          </p>
        </div>
      </footer>

      <ToTop />
    </>
  );
}

function ToTop() {
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onScroll = () => {
      ref.current?.classList.toggle('show', window.scrollY > 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      ref={ref}
      className="to-top"
      aria-label="回到顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      ↑
    </button>
  );
}
