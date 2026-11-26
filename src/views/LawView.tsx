import { useMemo, useState } from 'react';
import type { LawData } from '../lib/types';
import { matchText, uniq } from '../lib/utils';
import { LawCard } from '../components/Cards';
import { Chips, EmptyBox, MasonryGrid, SearchBox } from '../components/UI';

export function LawView({ data }: { data: LawData }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('全部');

  const cats = useMemo(() => uniq(data.items.map((i) => i.category)), [data.items]);

  const items = useMemo(
    () =>
      data.items.filter((it) => {
        if (cat !== '全部' && it.category !== cat) return false;
        return matchText(it as unknown as Record<string, unknown>, query);
      }),
    [data.items, cat, query]
  );

  // 按分类分组，组内保持原顺序
  const groups = useMemo(() => {
    const g: Record<string, typeof items> = {};
    for (const it of items) {
      (g[it.category] ||= []).push(it);
    }
    return g;
  }, [items]);

  const keys = useMemo(
    () => Object.keys(groups).sort((a, b) => a.localeCompare(b, 'zh')),
    [groups]
  );

  return (
    <>
      <div className="section-head">
        <h2>国考·省考执法与政治常识</h2>
        <span className="hint">
          共 {data.items.length} 条 · 当前筛选 {items.length} 条
        </span>
      </div>

      <div className="notice">
        <b>每条均标注法条或文献出处与官方链接。</b>
        法条序号取自官方发布的现行有效文本；政治常识取自《中国共产党章程》《党的二十大报告》等官方全文。
        无法从官方源核实的考点不予收录，点击「原文链接」可跳转原文自行比对。
      </div>

      <div className="controls">
        <SearchBox
          id="lwQ"
          placeholder="搜索考点、法条、关键词…"
          initial={query}
          onQuery={setQuery}
        />
      </div>

      <Chips options={cats} current={cat} onChange={setCat} />

      {keys.length === 0 ? (
        <EmptyBox msg="没有匹配的条目" sub="试试放宽筛选条件或换个关键词" />
      ) : (
        keys.map((k) => (
          <div key={k}>
            <div className="section-head" style={{ marginTop: 26 }}>
              <h2 style={{ fontSize: 16 }}>{k}</h2>
              <span className="hint">{groups[k].length} 条</span>
            </div>
            <MasonryGrid>
              {groups[k].map((it) => <LawCard key={it.id} item={it} />)}
            </MasonryGrid>
          </div>
        ))
      )}
    </>
  );
}
