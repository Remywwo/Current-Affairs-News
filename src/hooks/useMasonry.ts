import { useCallback, useEffect, useRef } from 'react';

/** 瀑布流排布参数 —— 必须与 CSS 的 .grid.cols-2 保持一致 */
export const MASONRY = {
  rowHeight: 1,  // 对应 CSS 的 grid-auto-rows: 1px
  gap: 14,       // 卡片垂直间距（CSS 里 row-gap: 0，由 JS 全权算进 span）
} as const;

/**
 * CSS Grid 瀑布流排布。
 *
 * 原理：CSS Grid 用 `grid-auto-rows: 1px` 的极细行高，
 * JS 测出每张卡片的实际高度后计算需要跨越多少行 span，
 * 再用 grid-row-end: span N 让卡片落到下一个空位。
 *
 * 关键计算（与 CSS Grid 规范一致）：
 *   row-gap 为 0 时，span N 实际占位 = N × rowHeight
 *   因此 span = ceil(内容高 + 卡片间距) = 内容高 + gap（1px 精度）
 *   卡片用 align-self: start 贴行顶，多出的这段就是卡片之间的间距。
 *
 * 为什么不用绝对定位：文字能正常换行，筛选/搜索重排不抖动。
 */
export function useMasonry<T extends HTMLElement>() {
  const containerRef = useRef<T | null>(null);
  const rafId = useRef<number | null>(null);

  const layout = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;

    // 只处理内容型瀑布流；grid-even 是等高规整组，不参与
    const grids = Array.from(
      root.querySelectorAll<HTMLElement>('.grid.cols-2:not(.grid-even)')
    );

    for (const grid of grids) {
      const cards = Array.from(grid.children) as HTMLElement[];
      if (!cards.length) continue;

      // 先全部置为自动定位，避免上一轮 span 干扰测量
      for (const c of cards) {
        c.style.gridRowEnd = 'auto';
        c.style.gridColumn = '';
      }

      // 列数必须在重置之后读 —— 这是个隐蔽的坑：
      //   上一轮布局给卡片写了内联 grid-column: 2 / span 1（当时是 3 列）。
      //   窗口缩窄后 CSS 变成 1 列，但这个内联样式仍指向不存在的第 2 列，
      //   CSS Grid 会为它创建一个**隐式列**。
      //   而 getComputedStyle 返回的 gridTemplateColumns 是**已使用值**，
      //   包含隐式轨道 → 读出来是 "0px 350px 350px" 三列，
      //   于是按 3 列重新分配，隐式列越建越多，永远错。
      //   先清空 gridColumn 再读，得到的才是 CSS 定义的轨道数。
      const styles = getComputedStyle(grid);
      const colCount =
        styles.gridTemplateColumns.split(' ').filter((s) => s && s !== 'none').length || 1;

      // 强制回流后测量高度
      const heights = cards.map((c) => c.getBoundingClientRect().height);

      // 逐列找当前最矮的一列放置
      const colHeights = new Array(colCount).fill(0);
      cards.forEach((c, i) => {
        let target = 0;
        for (let k = 1; k < colCount; k++) {
          if (colHeights[k] < colHeights[target] - 0.5) target = k;
        }
        const h = heights[i];
        const span = Math.max(1, Math.ceil(h + MASONRY.gap));
        const occupied = span * MASONRY.rowHeight;
        c.style.gridRowEnd = 'span ' + span;
        c.style.gridColumn = target + 1 + ' / span 1';
        // 用「占位高」推进列高，误差不累积，列更均衡
        colHeights[target] += occupied;
      });
    }
  }, []);

  /** 排布（下一帧执行，避免与 React 的 DOM 更新竞争） */
  const schedule = useCallback(() => {
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      layout();
    });
  }, [layout]);

  useEffect(() => {
    schedule();

    // 字体加载完成后高度会变，需要重排
    if (document.fonts?.ready) {
      document.fonts.ready.then(layout).catch(() => {});
    }

    // 列数随窗口宽度变化，需重新排布；防抖避免拖动时高频计算
    let resizeTimer: number | null = null;
    const onResize = () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(schedule, 150);
    };
    window.addEventListener('resize', onResize);

    // 内容尺寸变化（图片加载完成等）也要重排
    const observer = new ResizeObserver(() => schedule());
    observer.observe(containerRef.current!);

    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      observer.disconnect();
    };
  }, [schedule, layout]);

  return { containerRef, schedule };
}
