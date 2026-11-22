# 时政与执法常识学习站

一个**资料汇编工具**，汇总三块内容，每条都标注发布时间与官方出处链接，并配套一条自动更新流水线。

## 三大板块

| 板块 | 条数 | 覆盖范围 | 来源 |
|---|---|---|---|
| 讲话与指示 | 134 | 2025-05 — 2026-11 | 新华网「习近平报道专集」六个官方栏目 |
| 时政新闻 | 67 | 2026-11 — 至今 | 新华网「时政联播」「新华法治」 |
| 执法常识 | 66 | 11 个分类 | 全国人大网、中国政府网、最高法/最高检官网 |

## 页面结构

四个视图（哈希路由）：总览、讲话与指示、时政新闻、执法常识。

- **瀑布流布局** — 内容卡片以瀑布流展示。用 CSS Grid 的极细行高（`grid-auto-rows: 1px` + `row-gap: 0`）+ JS 计算 `grid-row-end: span N` 实现，**不用绝对定位**，因此文字正常换行、筛选与搜索重排不抖动。
  - 垂直间距**完全由 JS 算进 span**：`span = ceil(内容高 + 14px)`，因此卡片间距恒定 14px，不存在多余空白缝隙。
  - 关键：`row-gap` 必须为 0。Grid 的 span N 占位 = `N*行高 + (N-1)*rowGap`，若 rowGap 非 0，span 与真实高度会多出一截。
  - 误差不累积：列高用"占位高"而非"内容高"推进。
- **等高规整组** — 导航卡、自查卡等语义上应规整排列的卡片组加 `.grid-even`，不参与瀑布流。
- **正文限长 300 字** — 每张卡片的正文（要点 / 摘要 / 金句引用 / 要点标签）合计最多 300 字，超出部分在**展示层**截断并加省略号，同时给一条「查看原文全文 ↗」的链接。JSON 原始数据保持完整，点原文链接能看到全文。
  - 省略号本身计入预算，保证实际显示字数**严格 ≤ 300**。
  - 预算分配有优先级：讲话卡 = 金句（最多占 40%）> 要点；常识卡 = 要点标签 > 正文散文；新闻卡 = 摘要。
  - 截断只在展示层发生，不改动 `src/data/*.json`。
- **数据来源信息** — 内嵌在总览页底部（来源一览、栏目明细、数据快照、自查方法），不单独设页。
  - `meta.pending`（曾计划收录但无法核实的考点）保留在 JSON 里，但不在前端展示。
- 响应式、深浅色主题、关键词搜索、分类与年份筛选。

## 响应式布局

内容卡片用 CSS Grid 自适应列数，窄屏逐级降列：

| 视口宽度 | 列数 | 说明 |
|---|---|---|
| ≤900px | **1** | 手机横屏、小平板竖屏。卡片限宽 720px 居中，不铺满超宽屏 |
| 901–1279px | 2 | 小笔记本 |
| 1280–1499px | 3 | 桌面 |
| ≥1500px | 3（封顶） | 超宽屏不再加列，否则每列太窄、标题都放不下 |

另有 ≤640px（手机竖屏，收紧留白与字号）与 ≤380px（超窄屏，收紧卡片内边距）两档微调。
等高规整组（导航卡、统计块）与页脚三栏在 ≤900px 下同样降为单列。

**一个容易踩的坑**：`useMasonry.ts` 用 JS 给卡片写内联 `grid-column` 指定列号。
窗口从宽屏缩到窄屏时，上一轮的列号会指向不存在的列，CSS Grid 会创建
**隐式列**；而 `getComputedStyle().gridTemplateColumns` 返回的已使用值
**包含隐式轨道**，导致列数被误判、卡片被压成 42px。
解法是读列数前先清空内联 `gridColumn` 并强制回流 —— 详见该文件注释。
`responsive-test.mjs` 专门复现这个「先宽后窄」场景。

## 运行

技术栈：**React 18 + TypeScript + Vite**。

```bash
npm install
npm run dev       # 开发服务器 http://127.0.0.1:5173/
npm run build     # 类型检查 + 构建到 dist/
npm run preview   # 预览构建产物 http://127.0.0.1:4173/
```

> 数据在**构建时**静态引入（`src/data/*.json` → 打包进 JS），没有运行时 fetch，
> 因此没有加载失败态、首屏无闪烁。

## 部署

站点托管在 GitHub Pages（`remywwo.com/Current-Affairs-News/`），部署走
**GitHub Actions**，产物不入库：

```
push main → deploy-pages.yml → vite build → dist/ → actions/deploy-pages
```

| 环节 | 配置 |
|---|---|
| 构建产物目录 | `dist/`（`vite.config.ts` 的 `build.outDir`） |
| Pages 部署源 | **GitHub Actions**（仓库 Settings → Pages → Source） |
| 资源引用 | `base: './'` 相对路径，适配任意子路径 |
| 触发条件 | `push` 到 `main` 且命中路径过滤（`src/**`、`public/**`、配置文件） |

> **为什么不用 `docs/` 目录方案**：产物提交进仓库会让每次数据更新都产生
> 巨大 diff，仓库体积也随构建产物膨胀。走 Actions 后仓库只存源码。

> **为什么不用 `workflow_run` 触发部署**：数据更新流水线提交的是
> `src/data/*.json`，命中 `push` 的 `src/**` 路径过滤，已经会触发部署。
> 再加 `workflow_run` 会导致同一次数据更新部署两遍。

## 自动更新流水线

```bash
python3 scripts/update.py            # 正式写入
python3 scripts/update.py --dry-run  # 试运行，不改数据
```

仅用 Python 标准库，无需安装依赖。

**三步走，核心原则是「宁可不收录，也不可编造」：**

| 步骤 | 动作 | 失败处理 |
|---|---|---|
| ① 抓取 | 从 8 个固定官方栏目列表页解析新条目（标题 / 日期 / 原文链接） | 解析不出即丢弃 |
| ② 核验 | 对每个候选链接发起 HTTP 请求 | 非 200/3xx **直接丢弃**，清单会打印 |
| ③ 合并 | 与现有数据比对，只追加新链接 | 已有人工补充的要点与法条依据**一律保留** |

**当前抓取源（8 个）：**

| 板块 | 栏目 |
|---|---|
| 讲话与指示 | `jhqw` 讲话全文、`zywz` 重要文章、`zsps` 指示批示、`zdzx` 致电致信、`hyhd` 会议活动、`kcdy` 考察调研 |
| 时政新闻 | `szlb` 时政联播、`legal` 新华法治 |

> 注：新华网时政首页 `news.cn/politics/` 是纯 JS 渲染，服务端 HTML 中无任何日期与列表结构，无法静态解析，故未作为源。若该页将来改为服务端渲染，可加入 `NEWS_SOURCES`。

**链接校验的三态判定：**

| 状态 | 含义 | 处理 |
|---|---|---|
| `ok` | 严格 TLS 校验通过，返回 2xx/3xx | 收录 |
| `warn` | 链接可用但证书链不匹配（浏览器可正常打开） | 收录 + 标记 `linkWarnings` |
| `bad` | 真正失效（404 / 超时 / 无法解析） | 丢弃，并打印清单 |

> `warn` 与 `bad` 必须区分：部分政府站点使用通用证书（如 `legal.people.com.cn` 的证书 CN 为 `default.chinanetcenter.com`），严格校验客户端会报 TLS 错误但浏览器实际可正常访问。把这类误判为失效，会导致有价值的官方来源被错误丢弃。

> **已人工确认的链接**：`scripts/update.py` 的 `VERIFIED_TLS_URLS` 收录了经实测确认「浏览器可正常打开、内容完整有效」的链接，它们不再触发 `linkWarnings` 告警。收录条件：① 放宽校验后返回 200 且页面确为目标内容；② 人工核对正文与本站条目一致。**新增白名单必须先实测，不能凭印象添加。**

**其他机制：**

- 新增条目自动从原文摘录要点，打上「机器摘录」标记，便于人工润色
- 每次运行对全部法条链接做一次体检，失效条目标记 `needsReview`，**不自动删除**，交人工确认
- 编码自适应：新华网是 UTF-8、人民网是 GB18030，按响应头/meta 探测后再解码（统一按 UTF-8 解码会得到乱码，解析全部失真）
- 要点抽取为机械摘录，不改写、不归纳、不加评论——每条都是原文句子的截取

## 目录结构

```
index.html              Vite 入口 HTML（挂载点 #app）
vite.config.ts          构建配置（base: './'、outDir: dist）
src/
  main.tsx              React 挂载入口，静态引入数据
  App.tsx               路由分发、页头页脚
  data/
    speeches.json       讲话与重要指示
    news.json           时政新闻
    law-knowledge.json  执法常识考点
  components/
    Cards.tsx           三种卡片组件
    UI.tsx              搜索框、筛选 chips、网格容器
  hooks/
    useHashRoute.ts     hash 路由
    useMasonry.ts       瀑布流排布（span 计算）
    useSearch.ts        搜索状态 + IME 组合输入处理
    useTheme.ts         深浅色主题
  lib/
    types.ts            数据类型
    utils.ts            截断、匹配、分类样式
  styles/global.css     样式（浅色默认 + [data-theme="dark"] 深色、瀑布流）
public/
  favicon.svg           站点图标
scripts/
  update.py             自动更新流水线
  check-changes.py      检测数据是否有实质变化
  render-test.mjs       渲染冒烟测试（SSR 渲染各视图）
  masonry-test.mjs      瀑布流几何回归测试
  truncate-test.mjs     卡片正文截断回归测试
  browser-test.mjs      真实浏览器端到端测试
  responsive-test.mjs   响应式测试（各断点列数 + 窗口缩放重排）
  verify-build.mjs      一键验证入口（npm test 的实际执行者）
  push-via-api.py       绕过 OAuth 限制的推送脚本
.github/workflows/
  update-data.yml       每日数据更新流水线
  deploy-pages.yml      构建并部署到 GitHub Pages
```

## 测试

```bash
npm test                 # 一键跑完下面全部 5 个测试（推荐）
```

`npm test` 会依次执行：类型检查 → 生产构建 → 启动预览服务（自动挑空闲端口）
→ 3 个逻辑测试 → 2 个浏览器测试 → 关闭服务并汇总结果。
想复用已有的 `dist/` 跳过构建：`npm test -- --skip-build`。

也可以单独跑：

```bash
npx tsx scripts/render-test.mjs       # 渲染冒烟测试
node scripts/masonry-test.mjs         # 瀑布流几何回归测试
npx tsx scripts/truncate-test.mjs      # 卡片正文截断回归测试
node scripts/browser-test.mjs http://127.0.0.1:4173/   # 浏览器端到端
node scripts/responsive-test.mjs http://127.0.0.1:4173/ # 响应式测试
```

> 前三个测试都**不需要启动 HTTP 服务** —— 数据直接读本地 `src/data/*.json`。
> `render-test` / `truncate-test` 用 `tsx` 运行，因为它们要直接 import
> `src/` 下的 `.tsx` 组件。
>
> 后两个浏览器测试需要先 `npm run build && npm run preview`，
> 它们用真实 Chromium 加载页面。找不到浏览器时退出码为 2（跳过，不阻塞部署）。

> **为什么需要这几个测试**：
> - `render-test.mjs`：`tsc --noEmit` 只能查类型，查不出「读取了 undefined
>   属性」这类**运行期错误**。本测试用 `react-dom/server` 真实渲染各视图组件。
> - `masonry-test.mjs`：曾出现过「卡片之间有大量空白」的 bug —— 根因是 span 计算公式**除错了分母**（除以 `rowHeight` 而非 `rowHeight + rowGap`），导致 span 被放大约 3 倍、视觉间距达 298～816px。本测试严格按 CSS Grid 规范（`span N 占位 = N*行高 + (N-1)*rowGap`）复算，并校验 CSS 与 `useMasonry.ts` 的配置常量是否同步。
> - `truncate-test.mjs`：卡片正文限 300 字，曾出现省略号**没算进预算**导致实际显示 301 字。本测试独立复算每张卡片的正文字数，并验证展示文本始终是源文本的前缀（不篡改、不编造）。
> - `browser-test.mjs`：覆盖真实浏览器里才暴露的问题 —— 页面是否白屏、中文输入是否被 IME 打断、瀑布流实际间距是否正确、控制台是否有报错。
> - `responsive-test.mjs`：固化各断点的列数预期，并复现「先宽屏后窄屏」的窗口缩放场景 —— 曾出现卡片被压成 42px 的 bug（CSS Grid 隐式列陷阱，详见 `useMasonry.ts` 注释）。

改完前端代码务必把前三个都跑一遍；改动涉及渲染或交互时，第四个也要跑；改动涉及样式或布局时，第五个也要跑。

## 数据规范

每条条目**必须**包含：

- 讲话 / 新闻：`date`（发布时间）、`source`（发布主体）、`sourceUrl`（原文链接）
- 常识考点：`basis`（法条依据）、`source`（发布主体）、`sourceUrl`（官方链接）、`updatedAt`（现行版本）

缺任一字段的条目不予收录。要点部分为原文的分类摘录，不添加原文没有的论断。

## 诚实边界

以下 5 项曾计划收录，但因无法在官方源核实到确切条号或版本，**一律未收录**，并在站内「数据来源」页明确列出：

1. 《立法法》各条具体条文号 —— 未检得稳定单页全文链接，按章节级定位收录
2. 《民法典》分则各章条文 —— 条目量庞大，仅收录总则与高频原则条文
3. 习近平同志《论法治》具体篇目与页码 —— 需以人民出版社正式出版版本核对
4. 行测常识判断的具体真题与官方答案 —— 须以人事部考试大纲或官方发布为准
5. 「十三个方面成就」逐条完整表述 —— 需核对十九届六中全会《决议》原文相应段落

## 免责

本站不代替官方发布渠道，不提供法律意见。个案请以现行有效法律文本及官方解释为准，引用请注明出处。
