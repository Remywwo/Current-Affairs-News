import type { AppData } from '../lib/types';
import { byDateDesc, uniq } from '../lib/utils';
import { NewsCard, SpeechCard } from '../components/Cards';
import { EvenGrid } from '../components/UI';
import { SourcesSection } from './SourcesSection';

function NavCard({ route, title, desc, count, cls }: {
  route: string; title: string; desc: string; count: string; cls: string;
}) {
  return (
    <a className="card" href={'#' + route} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div className="card-head">
        <h3 className="card-title">{title}</h3>
        <span className={`tag ${cls}`}>{count}</span>
      </div>
      <p className="summary">{desc}</p>
    </a>
  );
}

export function HomeView({ data }: { data: AppData }) {
  const s = data.speeches.items.length;
  const n = data.news.items.length;
  const l = data.law?.items.length ?? 0;
  const cats = uniq(data.speeches.items.map((i) => i.category));

  const latestSpeech = [...data.speeches.items].sort(byDateDesc).slice(0, 6);
  const latestNews = [...data.news.items].sort(byDateDesc).slice(0, 8);

  return (
    <>
      <section className="hero">
        <span className="hero-tag">官方来源 · 逐条可溯源 · 无编造</span>
        <h1>时政要点与执法、政治常识，一站备齐</h1>
        <p>
          三个板块：习近平总书记重要讲话与重要指示、最新时政新闻、国考省考执法与政治类常识。
          <strong>每一条都标注了发布时间与官方出处链接</strong>，
          要点为原文分类摘录，不作演绎。数据快照：{data.speeches.meta.updatedAt}。
        </p>
        <div className="hero-stats">
          <div className="stat-pill"><b>{s}</b><span>讲话/指示/文章</span></div>
          <div className="stat-pill"><b>{n}</b><span>时政新闻</span></div>
          <div className="stat-pill"><b>{l}</b><span>执法与政治常识</span></div>
          <div className="stat-pill"><b>{cats.length}</b><span>讲话类别</span></div>
        </div>
      </section>

      <div className="notice">
        <b>使用前必读：</b>本站是<strong>资料汇编工具</strong>，不是权威发布渠道。
        所有条目指向新华网等官方原文，请以原文为准。讲话要点为摘录压缩，
        涉及引用的完整语境请点开原文链接核对。
        <br /><br />
        <b>链接核验：</b>全站 {s + n + l} 条内容的来源链接已逐条发起 HTTP 访问校验，
        其中官方直链均可直接打开；少数转载类来源（如政务微信公众号、中新网引述）会正常跳转，
        卡片内已单独标注其来源性质。
      </div>

      <div className="section-head">
        <h2>最新讲话与指示</h2>
        <span className="hint">覆盖 {data.speeches.meta.coverage}</span>
      </div>
      <div className="grid cols-2">
        {latestSpeech.map((it) => <SpeechCard key={it.id} item={it} />)}
      </div>
      <p style={{ marginTop: 16 }}>
        <a href="#/speeches" style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 14 }}>
          查看全部 {s} 条讲话与指示 →
        </a>
      </p>

      <div className="section-head">
        <h2>最新时政</h2>
        <span className="hint">覆盖 {data.news.meta.coverage}</span>
      </div>
      <div className="grid cols-2">
        {latestNews.map((it) => <NewsCard key={it.id} item={it} />)}
      </div>
      <p style={{ marginTop: 16 }}>
        <a href="#/news" style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 14 }}>
          查看全部 {n} 条时政新闻 →
        </a>
      </p>

      <div className="section-head"><h2>三大板块导航</h2></div>
      <EvenGrid>
        <NavCard
          route="/speeches" title="讲话与指示" cls="t-red" count={`${s} 条`}
          desc="习近平重要讲话全文、重要指示批示、《求是》重要文章、致电致信、考察调研"
        />
        <NavCard
          route="/news" title="时政新闻" cls="t-blue" count={`${n} 条`}
          desc="时政要闻、法治与执法动态、政策新规，附关键数据"
        />
        <NavCard
          route="/law" title="执法与政治常识" cls="t-green" count={`${l} 条`}
          desc="行政法、行政诉讼、宪法、刑法、公文写作，以及党的性质宗旨、基本路线、组织原则、党的纪律、全过程人民民主等政治常识考点"
        />
      </EvenGrid>

      <SourcesSection data={data} />
    </>
  );
}
