import { useMemo, useState } from 'react';
import type { SpeechData } from '../lib/types';
import { byDateDesc, matchText, uniq } from '../lib/utils';
import { SpeechCard } from '../components/Cards';
import { Chips, EmptyBox, MasonryGrid, SearchBox } from '../components/UI';

export function SpeechesView({ data }: { data: SpeechData }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('全部');
  const [year, setYear] = useState('全部');

  const cats = useMemo(() => uniq(data.items.map((i) => i.category)), [data.items]);
  const years = useMemo(
    () => uniq(data.items.map((i) => (i.date || '').slice(0, 4))).sort((a, b) => b.localeCompare(a)),
    [data.items]
  );

  const items = useMemo(
    () =>
      data.items
        .filter((it) => {
          if (cat !== '全部' && it.category !== cat) return false;
          if (year !== '全部' && (it.date || '').slice(0, 4) !== year) return false;
          return matchText(it as unknown as Record<string, unknown>, query);
        })
        .sort(byDateDesc),
    [data.items, cat, year, query]
  );

  return (
    <>
      <div className="section-head">
        <h2>讲话与重要指示</h2>
        <span className="hint">
          共 {data.items.length} 条 · 当前筛选 {items.length} 条
        </span>
      </div>

      <div className="controls">
        <SearchBox
          id="spQ"
          placeholder="搜索标题、要点、专题…"
          initial={query}
          onQuery={setQuery}
        />
      </div>

      <Chips options={cats} current={cat} onChange={setCat} />
      <Chips options={years} current={year} onChange={setYear} ns="y" />

      {items.length > 0 ? (
        <MasonryGrid>
          {items.map((it) => <SpeechCard key={it.id} item={it} />)}
        </MasonryGrid>
      ) : (
        <EmptyBox msg="没有匹配的条目" sub="试试放宽筛选条件或换个关键词" />
      )}
    </>
  );
}
