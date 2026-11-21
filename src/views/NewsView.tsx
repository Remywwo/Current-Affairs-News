import { useMemo, useState } from 'react';
import type { NewsData } from '../lib/types';
import { byDateDesc, matchText, uniq } from '../lib/utils';
import { NewsCard } from '../components/Cards';
import { Chips, EmptyBox, MasonryGrid, SearchBox } from '../components/UI';

export function NewsView({ data }: { data: NewsData }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('全部');

  const cats = useMemo(() => uniq(data.items.map((i) => i.category)), [data.items]);

  const items = useMemo(
    () =>
      data.items
        .filter((it) => {
          if (cat !== '全部' && it.category !== cat) return false;
          return matchText(it as unknown as Record<string, unknown>, query);
        })
        .sort(byDateDesc),
    [data.items, cat, query]
  );

  return (
    <>
      <div className="section-head">
        <h2>最新时政新闻</h2>
        <span className="hint">
          共 {data.items.length} 条 · 当前筛选 {items.length} 条
        </span>
      </div>

      <div className="controls">
        <SearchBox
          id="nwQ"
          placeholder="搜索标题、摘要、分类…"
          initial={query}
          onQuery={setQuery}
        />
      </div>

      <Chips options={cats} current={cat} onChange={setCat} />

      {items.length > 0 ? (
        <MasonryGrid>
          {items.map((it) => <NewsCard key={it.id} item={it} />)}
        </MasonryGrid>
      ) : (
        <EmptyBox msg="没有匹配的条目" sub="试试放宽筛选条件或换个关键词" />
      )}
    </>
  );
}
