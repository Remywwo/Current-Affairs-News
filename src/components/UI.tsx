import type { ReactNode } from 'react';
import { useSearch } from '../hooks/useSearch';

/** 分类筛选 chip 组 */
export function Chips({ options, current, onChange, ns }: {
  options: string[];
  current: string;
  onChange: (v: string) => void;
  ns?: string;
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button
          key={o}
          className={`chip${o === current ? ' on' : ''}`}
          data-chip={ns || 'c'}
          data-val={o}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * 搜索输入框。
 *
 * 刻意做成**非受控**（value 不跟随 state），否则 React 会在每次
 * IME 组合过程中重设 value，打断输入法的组合状态 —— 中文就打不出来。
 * 组合期间由输入法自己管理 DOM 的 value，组合结束后才同步进状态。
 */
export function SearchBox({ id, placeholder, initial = '', onQuery }: {
  id?: string;
  placeholder: string;
  initial?: string;
  onQuery: (q: string) => void;
}) {
  const s = useSearch(initial);

  return (
    <div className="search-box">
      <input
        ref={s.inputRef}
        id={id}
        type="search"
        placeholder={placeholder}
        defaultValue={initial}
        onCompositionStart={s.onCompositionStart}
        onCompositionEnd={(e) => {
          s.onCompositionEnd(e);
          onQuery(e.currentTarget.value);
        }}
        onInput={(e) => {
          s.onInput(e);
          // 组合中不触发搜索，避免重渲染打断输入法
          if (!s.isComposing) onQuery(e.currentTarget.value);
        }}
      />
    </div>
  );
}

/** 空状态 */
export function EmptyBox({ msg, sub }: { msg: string; sub?: string }) {
  return (
    <div className="empty">
      <span className="empty-icon">∅</span>
      {msg}
      {sub && <div style={{ marginTop: 8, fontSize: 13 }}>{sub}</div>}
    </div>
  );
}

/** 内容型瀑布流网格 */
export function MasonryGrid({ children }: { children: ReactNode }) {
  return <div className="grid cols-2" style={{ marginTop: 18 }}>{children}</div>;
}

/** 等高规整组（不参与瀑布流） */
export function EvenGrid({ children }: { children: ReactNode }) {
  return <div className="grid cols-2 grid-even">{children}</div>;
}
