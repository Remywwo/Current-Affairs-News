import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import type { AppData } from './lib/types';
import './styles/global.css';

// 数据在构建时静态引入 —— 站点是纯静态的，没必要运行时再 fetch。
// 好处：没有加载失败态、SEO 友好、首屏无闪烁、Pages 上更快。
import speeches from './data/speeches.json';
import news from './data/news.json';
import law from './data/law-knowledge.json';

const data: AppData = {
  speeches: speeches as unknown as AppData['speeches'],
  news: news as unknown as AppData['news'],
  law: law as unknown as AppData['law'],
};

const root = document.getElementById('app');
if (!root) {
  document.getElementById('root')!.innerHTML =
    '<div class="empty"><span class="empty-icon">⚠</span>未找到挂载节点</div>';
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App data={data} />
    </React.StrictMode>
  );
}
