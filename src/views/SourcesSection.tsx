import type { AppData } from '../lib/types';

/** 数据来源与核验说明（内嵌于总览页底部） */
export function SourcesSection({ data }: { data: AppData }) {
  const { speeches, news, law } = data;

  const byCat: Record<string, number> = {};
  for (const i of speeches.items) byCat[i.category] = (byCat[i.category] || 0) + 1;

  return (
    <>
      <div className="section-head">
        <h2>数据来源与核验说明</h2>
        <span className="hint">全部条目均可回溯至官方原文</span>
      </div>

      <div className="notice">
        <b>本站的编写原则：</b><br />
        1. 所有条目均来自官方渠道的公开页面，不使用二手转述、不使用未经核实的网络流传文本。<br />
        2. 每条必含<strong>发布时间</strong>与<strong>原文链接</strong>，缺一者不予收录。<br />
        3. 「要点」为原文的分类摘录与压缩，不添加原文没有的论断，不作评论。<br />
        4. 讲话原文与指示原文以新华网受权发布版本为准；求是文章以《求是》刊发文本为准。
      </div>

      <div className="section-head"><h2>抓取来源一览</h2></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>板块</th><th>官方栏目</th><th>入口地址</th><th>条目数</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>讲话与指示</td>
              <td>新华网 · 习近平报道专集</td>
              <td><code>{speeches.meta.indexUrls?.map((u, i) => (
                <span key={i}>{u}{i < (speeches.meta.indexUrls?.length ?? 0) - 1 && <br />}</span>
              ))}</code></td>
              <td>{speeches.items.length}</td>
            </tr>
            <tr>
              <td>时政新闻</td>
              <td>新华网 · 时政 / 时政联播 / 新华法治</td>
              <td><code>{news.meta.indexUrls?.map((u, i) => (
                <span key={i}>{u}{i < (news.meta.indexUrls?.length ?? 0) - 1 && <br />}</span>
              ))}</code></td>
              <td>{news.items.length}</td>
            </tr>
            <tr>
              <td>执法与政治常识</td>
              <td>全国人大网 · 中国政府网 · 共产党员网 · 最高法/最高检</td>
              <td><code>flk.npc.gov.cn · www.gov.cn · www.12371.cn · www.court.gov.cn · www.spp.gov.cn</code></td>
              <td>{law?.items.length ?? 0}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="table-hint">← 左右滑动查看完整表格 →</p>

      <div className="section-head"><h2>讲话栏目明细</h2></div>
      <div className="chips">
        {Object.keys(byCat).map((c) => (
          <span key={c} className="chip on" style={{ cursor: 'default' }}>
            {c} {byCat[c]}
          </span>
        ))}
      </div>

      <div className="section-head"><h2>数据快照信息</h2></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>项目</th><th>内容</th></tr></thead>
          <tbody>
            <tr><td>讲话板块覆盖时段</td><td>{speeches.meta.coverage}</td></tr>
            <tr><td>时政板块覆盖时段</td><td>{news.meta.coverage}</td></tr>
            <tr><td>数据抓取日期</td><td>{speeches.meta.updatedAt}</td></tr>
            <tr><td>讲话板块声明</td><td>{speeches.meta.disclaimer}</td></tr>
            <tr><td>时政板块声明</td><td>{news.meta.disclaimer}</td></tr>
            {law?.meta && (
              <tr>
                <td>常识板块说明</td>
                <td>{law.meta.disclaimer || '每条标注法条依据与官方来源。'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {law?.meta?.needsReview && law.meta.needsReview.length > 0 && (
        <div className="notice">
          <b>⚠ 有 {law.meta.needsReview.length} 条法条链接已失效，需人工复核：</b><br />
          {law.meta.needsReview.map((r) => (
            <span key={r.id}>
              {r.id}（{r.code}）{r.sourceUrl}<br />
            </span>
          ))}
        </div>
      )}

      {law?.meta?.linkWarnings && law.meta.linkWarnings.length > 0 && (
        <div className="notice">
          <b>ℹ 有 {law.meta.linkWarnings.length} 条法条链接存在技术性瑕疵（浏览器可正常打开，仅证书链不匹配），已保留但建议人工确认：</b><br />
          {law.meta.linkWarnings.map((r) => (
            <span key={r.id}>
              {r.id}（{r.code}）{r.sourceUrl}<br />
            </span>
          ))}
        </div>
      )}

      <div className="section-head"><h2>更新与自查方法</h2></div>
      <div className="grid cols-2 grid-even">
        <div className="card">
          <h3 className="card-title">如何自行验证</h3>
          <ul className="bullets">
            <li>每张卡片底部的「原文链接 ↗」直达官方页面，Ctrl/⌘ + 点击在新标签打开</li>
            <li>比对卡片中的日期与原网页发布时间是否一致</li>
            <li>常识板块点击「原文链接」查看法条全文与条号</li>
            <li>若发现不一致，以官方原文为准并告知维护者</li>
          </ul>
        </div>
        <div className="card">
          <h3 className="card-title">本站不做什么</h3>
          <ul className="bullets">
            <li>不代替官方发布渠道，转载请注明出处</li>
            <li>不提供法律意见，个案请咨询执业人员</li>
            <li>不收录无法溯源的网络流传版本</li>
            <li>不对原文作立场性评价或延伸解读</li>
          </ul>
        </div>
      </div>
    </>
  );
}
