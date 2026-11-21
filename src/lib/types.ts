/** 数据结构类型定义 —— 与 src/data/*.json 的实际结构一一对应 */

export interface Meta {
  title?: string;
  coverage?: string;
  updatedAt?: string;
  dataOrigin?: string;
  indexUrls?: string[];
  disclaimer?: string;
  linkVerification?: string;
  /** 链接失效待人工复核 */
  needsReview?: ReviewItem[];
  /** 链接技术性瑕疵（证书链不匹配等），已人工确认 */
  linkWarnings?: ReviewItem[];
  /** 曾计划收录但无法核实的考点 */
  pending?: string[];
  lastRun?: LastRun;
}

export interface LastRun {
  at?: string;
  total?: number;
  candidates?: number;
  linkOk?: number;
  dropped?: number;
  added?: number;
  invalidLinks?: number;
  warnLinks?: number;
}

export interface ReviewItem {
  id: string;
  code: string | number;
  sourceUrl: string;
  note?: string;
}

/** 讲话与重要指示 */
export interface SpeechItem {
  id: string;
  date: string;
  time?: string;
  place?: string;
  title: string;
  subtitle?: string;
  topic?: string;
  category: string;
  keyPoints?: string[];
  quote?: string;
  sourceNote?: string;
  source?: string;
  sourceUrl: string;
  autoPoints?: boolean;
}

/** 时政新闻 */
export interface NewsItem {
  id: string;
  date: string;
  title: string;
  summary?: string | null;
  category: string;
  source?: string;
  sourceUrl: string;
  sourceNote?: string;
  autoSummary?: boolean;
}

/** 执法常识考点 */
export interface LawItem {
  id: string;
  category: string;
  subcategory?: string;
  title: string;
  content?: string;
  keyPoints?: string[];
  basis?: string;
  source?: string;
  sourceUrl: string;
  updatedAt?: string;
  note?: string;
}

export interface SpeechData {
  meta: Meta;
  items: SpeechItem[];
}

export interface NewsData {
  meta: Meta;
  items: NewsItem[];
}

export interface LawData {
  meta: Meta;
  items: LawItem[];
}

export interface AppData {
  speeches: SpeechData;
  news: NewsData;
  law: LawData;
}
