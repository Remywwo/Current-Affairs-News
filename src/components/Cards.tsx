import type { LawItem, NewsItem, SpeechItem } from '../lib/types';
import {
  MAX_CARD_CHARS, catClass, truncatePoints, truncateText,
} from '../lib/utils';

/** 卡片底部的来源行 */
function SourceLine({ date, time, place, source, sourceUrl, auto }: {
  date?: string; time?: string; place?: string;
  source?: string; sourceUrl: string; auto?: boolean;
}) {
  return (
    <div className="meta">
      <span className="date">{date}{time ? ' ' + time : ''}</span>
      {place && (<><span className="sep">|</span><span>{place}</span></>)}
      <span className="sep">|</span>
      <span>来源：{source || '新华网'}</span>
      {auto && (
        <>
          <span className="sep">|</span>
          <span className="auto-flag" title="要点由更新脚本从原文自动摘录，未经人工润色；点击原文链接可核对完整语境">
            机器摘录
          </span>
        </>
      )}
      <span className="sep">|</span>
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer">原文链接 ↗</a>
    </div>
  );
}

/** 截断提示 —— 引导读者点底部原文链接 */
function TruncTip() {
  return <p className="trunc-tip">正文较长，已截断显示，点击底部原文链接，查看原文</p>;
}

/** 讲话与重要指示卡片 */
export function SpeechCard({ item }: { item: SpeechItem }) {
  const pts = (item.keyPoints ?? []).filter(Boolean);

  // 正文总预算 300 字，金句引用计入（它也是正文）。
  // 优先级：金句（视觉主角）> 要点。金句最多占预算的 40%，其余留给要点，
  // 这样无论金句多长，总显示字数都严格 ≤ 300。
  const qBudget = Math.min(item.quote?.length ?? 0, Math.floor(MAX_CARD_CHARS * 0.4));
  const q = item.quote ? truncateText(item.quote, qBudget) : { text: '', truncated: false };

  const t = pts.length
    ? truncatePoints(pts, MAX_CARD_CHARS - q.text.length)
    : { kept: [] as string[], truncated: false, shown: 0 };

  const truncated = t.truncated || q.truncated;

  return (
    <article className="card">
      <div className="card-head">
        <h3 className="card-title">
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.title}</a>
        </h3>
        <span className={`tag ${catClass(item.category)}`}>{item.category}</span>
      </div>
      {item.subtitle && <p className="card-sub">{item.subtitle}</p>}
      {item.topic && <p className="card-sub">专题：{item.topic}</p>}

      {t.kept.length > 0 && (
        <ul className="bullets">
          {t.kept.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      {truncated && <TruncTip />}

      {item.quote && <blockquote className="quote">{q.text}</blockquote>}
      {item.sourceNote && <p className="src-note">{item.sourceNote}</p>}

      <SourceLine
        date={item.date} time={item.time} place={item.place}
        source={item.source} sourceUrl={item.sourceUrl} auto={item.autoPoints}
      />
    </article>
  );
}

/** 时政新闻卡片 */
export function NewsCard({ item }: { item: NewsItem }) {
  const st = truncateText(item.summary ?? '', MAX_CARD_CHARS);

  return (
    <article className="card">
      <div className="card-head">
        <h3 className="card-title">
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.title}</a>
        </h3>
        <span className={`tag ${catClass(item.category)}`}>{item.category}</span>
      </div>
      {st.text && <p className="summary">{st.text}</p>}
      {st.truncated && <TruncTip />}
      {item.sourceNote && <p className="src-note">{item.sourceNote}</p>}
      <SourceLine
        date={item.date} source={item.source}
        sourceUrl={item.sourceUrl} auto={item.autoSummary}
      />
    </article>
  );
}

/** 执法常识卡片 */
export function LawCard({ item }: { item: LawItem }) {
  // 正文（content）与要点标签（keyPoints）共享 300 字预算。
  // 优先级：要点标签（信息密度高，备考价值大）> 正文散文。
  const kps = item.keyPoints ?? [];
  const kpRes = truncatePoints(kps, MAX_CARD_CHARS);
  const contentBudget = Math.max(0, MAX_CARD_CHARS - kpRes.shown);
  const ct = truncateText(item.content ?? '', contentBudget);

  return (
    <article className="card law-item">
      <div className="card-head">
        <h3 className="card-title">{item.title}</h3>
        <span className={`tag ${catClass(item.category)}`}>{item.category}</span>
      </div>
      {item.subcategory && <p className="card-sub">{item.subcategory}</p>}

      {ct.text && <p className="summary">{ct.text}</p>}
      {kpRes.kept.length > 0 && (
        <div className="kp">
          {kpRes.kept.map((k, i) => <span key={i}>{k}</span>)}
        </div>
      )}
      {(ct.truncated || kpRes.truncated) && <TruncTip />}

      <div className="law-basis">
        <div><b>法条依据：</b>{item.basis || '—'}</div>
        <div className="row">
          <span>发布主体：{item.source || '—'}</span>
          {item.updatedAt && <span>现行版本：{item.updatedAt}</span>}
          {item.sourceUrl && (
            <span>
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">原文链接 ↗</a>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
