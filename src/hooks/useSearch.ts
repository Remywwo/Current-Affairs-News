import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 搜索框状态（兼容中文输入法）。
 *
 * 问题背景：
 *   中文输入法（IME）组合输入时，input 事件会在拼音组合过程中就触发。
 *   如果此时重渲染导致 input 元素被销毁重建，IME 的组合状态依附在
 *   旧元素上随之丢失 —— 表现为「无法输入中文」。
 *
 * 解决：
 *   1. compositionstart / compositionend 维护 isComposing 标志
 *   2. 组合期间只更新草稿值，**不触发搜索**（即不重渲染列表）
 *   3. 组合结束（中文上屏）后才把最终值交给上层执行搜索
 *
 * 配合 SearchBox 使用**非受控 input**：组合期间 DOM 的 value 由输入法
 * 自己管理，React 不去碰它；只有组合结束后才同步进状态。
 * （若用受控 input，React 每次 setState 都会重设 value，同样会打断组合。）
 */
export interface SearchController {
  /** 已提交的查询词（用于过滤列表） */
  query: string;
  /** 输入框 DOM 引用 */
  inputRef: React.RefObject<HTMLInputElement>;
  /** 当前是否处于输入法组合过程中 */
  readonly isComposing: boolean;
  onCompositionStart: () => void;
  onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>) => void;
  onInput: (e: React.FormEvent<HTMLInputElement>) => void;
  /** 清空 */
  reset: () => void;
}

export function useSearch(initial = ''): SearchController {
  const [query, setQuery] = useState(initial);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 外部重置（如切换路由）时同步
  useEffect(() => {
    setQuery(initial);
    if (inputRef.current && inputRef.current.value !== initial) {
      inputRef.current.value = initial;
    }
  }, [initial]);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    setQuery(e.currentTarget.value);
  }, []);

  const onInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    if (composingRef.current) return;   // 组合中不动状态
    setQuery(e.currentTarget.value);
  }, []);

  const reset = useCallback(() => {
    setQuery('');
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  return {
    query,
    inputRef,
    get isComposing() { return composingRef.current; },
    onCompositionStart,
    onCompositionEnd,
    onInput,
    reset,
  };
}
