/** 纯函数工具集 —— 从原 app.js 迁移，行为保持一致 */

/** 卡片「正文」合计最多多少字 */
export const MAX_CARD_CHARS = 300;

/** 按累计字数截断要点数组：保留完整条目，不切断单条要点；
 *  最后一条放不下时，在它内部切到剩余额度并以省略号收尾。
 *  返回 shown = 实际显示字数（已含省略号）。 */
export function truncatePoints(points: string[], limit: number): {
  kept: string[];
  truncated: boolean;
  shown: number;
} {
  const kept: string[] = [];
  let used = 0;

  for (const p of points) {
    if (used + p.length > limit) {
      const remain = limit - used;
      if (remain > 12) {
        // 末条切到剩余额度；省略号本身也占 1 字，故切 remain-1
        const cut = p.slice(0, remain - 1).trim() + '…';
        kept.push(cut);
        used += cut.length;
      }
      return { kept, truncated: true, shown: used };
    }
    kept.push(p);
    used += p.length;
  }
  return { kept, truncated: false, shown: used };
}

/** 截断单段文本。省略号本身计入预算，保证「实际显示字数」严格 ≤ limit。 */
export function truncateText(text: string | undefined | null, limit: number): {
  text: string;
  truncated: boolean;
} {
  if (!text) return { text: '', truncated: false };
  if (text.length <= limit) return { text, truncated: false };
  if (limit <= 0) return { text: '', truncated: true };
  if (limit <= 1) return { text: '…', truncated: true };
  return { text: text.slice(0, limit - 1).trim() + '…', truncated: true };
}

/** 检索：在条目的多个字段里做不区分大小写的子串匹配 */
export function matchText(item: Record<string, unknown>, q: string): boolean {
  if (!q) return true;
  const hay = [
    item.title,
    item.subtitle,
    item.summary,
    item.content,
    item.topic,
    item.category,
    item.basis,
    item.source,
    Array.isArray(item.keyPoints) ? item.keyPoints.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.indexOf(q.toLowerCase()) !== -1;
}

/** 去重（保持顺序） */
export function uniq<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of arr) {
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** 分类 → 样式类名 */
const CAT_CLASS: Record<string, string> = {
  重要讲话: 't-red', 重要指示: 't-red', 重要文章: 't-red',
  国事活动: 't-blue', 致电致信: 't-blue', 考察调研: 't-blue',
  党建: 't-purple', 党代会: 't-purple', 党务: 't-purple',
  法治: 't-blue', 经济: 't-amber', 科技: 't-green',
  民生: 't-green', 外交: 't-blue', 教育: 't-green',
  生态: 't-green', 应急: 't-amber', 历史: 't-mute',
  安全: 't-amber', 区域: 't-mute', 三农: 't-green',
  文化: 't-purple', 统一战线: 't-purple', 城市: 't-mute',
  国防: 't-mute', 青年: 't-green', 人大: 't-mute',
  执法: 't-amber', 法治建设: 't-blue', 社会治理: 't-amber',
  社会: 't-mute', 安全生产: 't-amber', 公共卫生: 't-green',
  基础设施: 't-mute', 人事: 't-mute', 政务: 't-blue',
};

export function catClass(cat: string): string {
  return CAT_CLASS[cat] || 't-mute';
}

/** 日期倒序（新的在前） */
export function byDateDesc(a: { date?: string }, b: { date?: string }): number {
  return (a.date || '') < (b.date || '') ? 1 : -1;
}
