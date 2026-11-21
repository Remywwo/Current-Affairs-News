/* ============================================
   时政与执法常识学习站 — 应用逻辑
   数据全部来自 data/*.json，均带 date + sourceUrl
   ============================================ */
(function () {
  'use strict';

  var DATA = { speeches: null, news: null, law: null };
  var STATE = {
    route: '/',
    speechQ: '', speechCat: '全部', speechYear: '全部',
    newsQ: '', newsCat: '全部',
    lawQ: '', lawCat: '全部'
  };

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function catClass(cat) {
    var m = {
      '重要讲话': 't-red', '重要指示': 't-red', '重要文章': 't-red',
      '国事活动': 't-blue', '致电致信': 't-blue', '考察调研': 't-blue',
      '党建': 't-purple', '党代会': 't-purple', '党务': 't-purple',
      '法治': 't-blue', '经济': 't-amber', '科技': 't-green',
      '民生': 't-green', '外交': 't-blue', '教育': 't-green',
      '生态': 't-green', '应急': 't-amber', '历史': 't-mute',
      '安全': 't-amber', '区域': 't-mute', '三农': 't-green',
      '文化': 't-purple', '统一战线': 't-purple', '城市': 't-mute',
      '国防': 't-mute', '青年': 't-green', '人大': 't-mute',
      '执法': 't-amber', '法治建设': 't-blue', '社会治理': 't-amber',
      '社会': 't-mute', '安全生产': 't-amber', '公共卫生': 't-green',
      '基础设施': 't-mute', '人事': 't-mute', '政务': 't-blue'
    };
    return m[cat] || 't-mute';
  }

  function sourceLine(item) {
    var d = item.date || '';
    var extra = item.time ? ' ' + item.time : '';
    var place = item.place ? ' · ' + esc(item.place) : '';
    var auto = (item.autoPoints || item.autoSummary)
      ? '<span class="sep">|</span><span class="auto-flag" title="要点由更新脚本从原文自动摘录，未经人工润色；点击原文链接可核对完整语境">机器摘录</span>'
      : '';
    return '<span class="date">' + esc(d) + esc(extra) + '</span>' +
           (place ? '<span class="sep">|</span><span>' + place + '</span>' : '') +
           '<span class="sep">|</span>' +
           '<span>来源：' + esc(item.source || '新华网') + '</span>' + auto +
           '<span class="sep">|</span>' +
           '<a href="' + esc(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer">原文链接 ↗</a>';
  }

  function matchText(item, q) {
    if (!q) return true;
    var hay = [item.title, item.subtitle, item.summary, item.content, item.topic, item.category,
               item.basis, item.source, (item.keyPoints || []).join(' '),
               (item.keyPoints || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q.toLowerCase()) !== -1;
  }

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) {
      if (v && !seen[v]) { seen[v] = 1; out.push(v); }
    });
    return out;
  }

  // ---------- 正文截断 ----------
  // 卡片「正文」合计最多 MAX_CARD_CHARS 字，超出以省略号收尾。
  //   正文 = 要点 / 摘要 / 金句引用 / 要点标签
  //   不含 = 标题、分类标签、日期来源、发布主体、法条依据等元信息
  // 截断在「展示层」完成，JSON 原始数据保持完整 —— 读者点原文链接能看到全文。
  var MAX_CARD_CHARS = 300;

  // 按累计字数截断要点数组：保留完整条目，不切断单条要点；
  // 最后一条放不下时，在它内部切到剩余额度并以省略号收尾。
  // 返回 shown = 实际显示字数（已含省略号），供其他段落计算剩余预算。
  function truncatePoints(points, limit) {
    var kept = [];
    var used = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (used + p.length > limit) {
        var remain = limit - used;
        if (remain > 12) {
          // 末条切到剩余额度；省略号本身也占 1 字，故切 remain-1
          var cut = p.slice(0, remain - 1).trim() + '…';
          kept.push(cut);
          used += cut.length;
        }
        return { kept: kept, truncated: true, shown: used };
      }
      kept.push(p);
      used += p.length;
    }
    return { kept: kept, truncated: false, shown: used };
  }

  // 截断单段文本（新闻摘要 / 常识正文 / 金句）。
  // 省略号本身计入预算，保证「实际显示字数」严格 ≤ limit。
  function truncateText(text, limit) {
    if (!text) return { text: '', truncated: false };
    if (text.length <= limit) return { text: text, truncated: false };
    if (limit <= 0) return { text: '', truncated: true };
    if (limit <= 1) return { text: '…', truncated: true };
    return { text: text.slice(0, limit - 1).trim() + '…', truncated: true };
  }

  // ---------- 讲话卡片 ----------
  function speechCard(it) {
    var pts = (it.keyPoints || []).filter(function (p) { return p; });
    var html = '<article class="card">';
    html += '<div class="card-head"><h3 class="card-title"><a href="' + esc(it.sourceUrl) +
            '" target="_blank" rel="noopener noreferrer">' + esc(it.title) + '</a></h3>' +
            '<span class="tag ' + catClass(it.category) + '">' + esc(it.category) + '</span></div>';
    if (it.subtitle) html += '<p class="card-sub">' + esc(it.subtitle) + '</p>';
    if (it.topic) html += '<p class="card-sub">专题：' + esc(it.topic) + '</p>';

    // 正文总预算 300 字，金句引用计入（它也是正文）。
    // 优先级：金句（视觉主角）> 要点。金句最多占预算的 40%，其余留给要点，
    // 这样无论金句多长，总显示字数都严格 ≤ 300。
    var qBudget = Math.min(it.quote ? it.quote.length : 0, Math.floor(MAX_CARD_CHARS * 0.4));
    var q = it.quote ? truncateText(it.quote, qBudget) : { text: '', truncated: false };
    if (pts.length) {
      var t = truncatePoints(pts, MAX_CARD_CHARS - q.text.length);
      html += '<ul class="bullets">' + t.kept.map(function (p) {
        return '<li>' + esc(p) + '</li>';
      }).join('') + '</ul>';
      if (t.truncated || q.truncated) {
        html += '<p class="trunc-tip">正文较长，已截断显示，点击底部原文链接，查看原文</p>';
      }
    }
    if (it.quote) html += '<blockquote class="quote">' + esc(q.text) + '</blockquote>';
    if (it.sourceNote) html += '<p class="src-note">' + esc(it.sourceNote) + '</p>';
    html += '<div class="meta">' + sourceLine(it) + '</div>';
    html += '</article>';
    return html;
  }

  // ---------- 新闻卡片 ----------
  function newsCard(it) {
    var html = '<article class="card">';
    html += '<div class="card-head"><h3 class="card-title"><a href="' + esc(it.sourceUrl) +
            '" target="_blank" rel="noopener noreferrer">' + esc(it.title) + '</a></h3>' +
            '<span class="tag ' + catClass(it.category) + '">' + esc(it.category) + '</span></div>';
    if (it.summary) {
      var st = truncateText(it.summary, MAX_CARD_CHARS);
      html += '<p class="summary">' + esc(st.text) + '</p>';
      if (st.truncated) {
        html += '<p class="trunc-tip">正文较长，已截断显示，点击底部原文链接，查看原文</p>';
      }
    }
    if (it.sourceNote) html += '<p class="src-note">' + esc(it.sourceNote) + '</p>';
    html += '<div class="meta">' + sourceLine(it) + '</div>';
    html += '</article>';
    return html;
  }

  // ---------- 常识卡片 ----------
  function lawCard(it) {
    var html = '<article class="card law-item">';
    html += '<div class="card-head"><h3 class="card-title">' + esc(it.title) + '</h3>' +
            '<span class="tag ' + catClass(it.category) + '">' + esc(it.category) + '</span></div>';
    if (it.subcategory) html += '<p class="card-sub">' + esc(it.subcategory) + '</p>';

    // 正文（content）与要点标签（keyPoints）共享 300 字预算。
    // 优先级：要点标签（信息密度高，备考价值大）> 正文散文。
    // 要点先占预算，正文用剩下的；要点本身超长时也会被截断。
    var content = it.content || '';
    var kps = it.keyPoints || [];
    var kpRes = truncatePoints(kps, MAX_CARD_CHARS);
    var contentBudget = Math.max(0, MAX_CARD_CHARS - kpRes.shown);
    var ct = truncateText(content, contentBudget);
    if (ct.text) html += '<p class="summary">' + esc(ct.text) + '</p>';
    if (kpRes.kept.length) {
      html += '<div class="kp">' + kpRes.kept.map(function (k) {
        return '<span>' + esc(k) + '</span>';
      }).join('') + '</div>';
    }
    if (ct.truncated || kpRes.truncated) {
      html += '<p class="trunc-tip">正文较长，已截断显示，点击底部原文链接，查看原文</p>';
    }
    html += '<div class="law-basis">';
    html += '<div><b>法条依据：</b>' + esc(it.basis || '—') + '</div>';
    html += '<div class="row">';
    html += '<span>发布主体：' + esc(it.source || '—') + '</span>';
    if (it.updatedAt) html += '<span>现行版本：' + esc(it.updatedAt) + '</span>';
    if (it.sourceUrl) {
      html += '<span><a href="' + esc(it.sourceUrl) +
              '" target="_blank" rel="noopener noreferrer">原文链接 ↗</a></span>';
    }
    html += '</div></div>';
    html += '</article>';
    return html;
  }

  // ---------- 路由 ----------
  function render() {
    var r = STATE.route;
    var app = $('#app');
    if (r === '/speeches') app.innerHTML = viewSpeeches();
    else if (r === '/news') app.innerHTML = viewNews();
    else if (r === '/law') app.innerHTML = viewLaw();
    else app.innerHTML = viewHome();

    $$('#siteNav a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === r);
    });
    bindDynamic();
    scheduleMasonry();
    if (location.hash !== '#' + r) history.replaceState(null, '', '#' + r);
    window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
  }

  // ---------- 首页 ----------
  function viewHome() {
    var s = DATA.speeches.items.length;
    var n = DATA.news.items.length;
    var l = DATA.law ? DATA.law.items.length : 0;
    var cats = uniq(DATA.speeches.items.map(function (i) { return i.category; }));
    var latestSpeech = DATA.speeches.items.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : -1;
    }).slice(0, 6);
    var latestNews = DATA.news.items.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : -1;
    }).slice(0, 8);

    var h = '';
    h += '<section class="hero">';
    h += '<span class="hero-tag">官方来源 · 逐条可溯源 · 无编造</span>';
    h += '<h1>时政要点与执法常识，一站备齐</h1>';
    h += '<p>三个板块：习近平总书记重要讲话与重要指示、最新时政新闻、国考省考执法类常识。' +
         '<strong>每一条都标注了发布时间与官方出处链接</strong>，要点为原文分类摘录，不作演绎。数据快照：' +
         esc(DATA.speeches.meta.updatedAt) + '。</p>';
    h += '<div class="hero-stats">';
    h += '<div class="stat-pill"><b>' + s + '</b><span>讲话/指示/文章</span></div>';
    h += '<div class="stat-pill"><b>' + n + '</b><span>时政新闻</span></div>';
    h += '<div class="stat-pill"><b>' + l + '</b><span>执法常识考点</span></div>';
    h += '<div class="stat-pill"><b>' + cats.length + '</b><span>讲话类别</span></div>';
    h += '</div></section>';

    h += '<div class="notice"><b>使用前必读：</b>本站是<strong>资料汇编工具</strong>，不是权威发布渠道。' +
         '所有条目指向新华网等官方原文，请以原文为准。讲话要点为摘录压缩，' +
         '涉及引用的完整语境请点开原文链接核对。' +
         '<br><br><b>链接核验：</b>全站 ' + (s + n + l) + ' 条内容的来源链接已逐条发起 HTTP 访问校验，' +
         '其中官方直链均可直接打开；少数转载类来源（如政务微信公众号、中新网引述）会正常跳转，' +
         '卡片内已单独标注其来源性质。</div>';

    h += '<div class="section-head"><h2>最新讲话与指示</h2>' +
         '<span class="hint">覆盖 ' + esc(DATA.speeches.meta.coverage) + '</span></div>';
    h += '<div class="grid cols-2">' + latestSpeech.map(speechCard).join('') + '</div>';
    h += '<p style="margin-top:16px"><a href="#/speeches" style="color:var(--blue);text-decoration:none;font-size:14px">查看全部 ' + s + ' 条讲话与指示 →</a></p>';

    h += '<div class="section-head"><h2>最新时政</h2>' +
         '<span class="hint">覆盖 ' + esc(DATA.news.meta.coverage) + '</span></div>';
    h += '<div class="grid cols-2">' + latestNews.map(newsCard).join('') + '</div>';
    h += '<p style="margin-top:16px"><a href="#/news" style="color:var(--blue);text-decoration:none;font-size:14px">查看全部 ' + n + ' 条时政新闻 →</a></p>';

    h += '<div class="section-head"><h2>三大板块导航</h2></div>';
    h += '<div class="grid cols-2 grid-even">';
    h += navCard('/speeches', '讲话与指示', '习近平重要讲话全文、重要指示批示、《求是》重要文章、致电致信、考察调研', s + ' 条', 't-red');
    h += navCard('/news', '时政新闻', '时政要闻、法治与执法动态、政策新规，附关键数据', n + ' 条', 't-blue');
    h += navCard('/law', '执法常识', '行政法、行政诉讼、宪法、刑法、公文写作等考点，每条标法条出处', l + ' 条', 't-green');
    h += '</div>';

    h += viewSourcesSection();
    return h;
  }

  function navCard(route, title, desc, count, cls) {
    return '<a class="card" href="#' + route + '" style="text-decoration:none;color:inherit;display:block">' +
      '<div class="card-head"><h3 class="card-title">' + esc(title) + '</h3>' +
      '<span class="tag ' + cls + '">' + esc(count) + '</span></div>' +
      '<p class="summary">' + esc(desc) + '</p></a>';
  }

  // ---------- 讲话页 ----------
  function viewSpeeches() {
    var cats = uniq(DATA.speeches.items.map(function (i) { return i.category; }));
    var years = uniq(DATA.speeches.items.map(function (i) { return (i.date || '').slice(0, 4); }))
                .sort(function (a, b) { return b - a; });
    var items = DATA.speeches.items.filter(function (it) {
      if (STATE.speechCat !== '全部' && it.category !== STATE.speechCat) return false;
      if (STATE.speechYear !== '全部' && (it.date || '').slice(0, 4) !== STATE.speechYear) return false;
      return matchText(it, STATE.speechQ);
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    var h = '<div class="section-head"><h2>讲话与重要指示</h2>' +
            '<span class="hint">共 ' + DATA.speeches.items.length + ' 条 · 当前筛选 ' + items.length + ' 条</span></div>';
    h += '<div class="controls">';
    h += '<div class="search-box"><input type="search" id="spQ" placeholder="搜索标题、要点、专题…" value="' + esc(STATE.speechQ) + '"></div>';
    h += '</div>';
    h += '<div class="chips" id="spCats">' +
         chip('全部', STATE.speechCat) + cats.map(function (c) { return chip(c, STATE.speechCat); }).join('') + '</div>';
    h += '<div class="chips" id="spYears" style="margin-top:8px">' +
         chip('全部', STATE.speechYear, 'y') + years.map(function (y) { return chip(y, STATE.speechYear, 'y'); }).join('') + '</div>';
    h += items.length
      ? '<div class="grid cols-2" style="margin-top:18px">' + items.map(speechCard).join('') + '</div>'
      : emptyBox('没有匹配的条目', '试试放宽筛选条件或换个关键词');
    return h;
  }

  function chip(label, current, ns) {
    return '<button class="chip' + (label === current ? ' on' : '') + '" data-chip="' +
           (ns || 'c') + '" data-val="' + esc(label) + '">' + esc(label) + '</button>';
  }

  // ---------- 新闻页 ----------
  function viewNews() {
    var cats = uniq(DATA.news.items.map(function (i) { return i.category; }));
    var items = DATA.news.items.filter(function (it) {
      if (STATE.newsCat !== '全部' && it.category !== STATE.newsCat) return false;
      return matchText(it, STATE.newsQ);
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    var h = '<div class="section-head"><h2>最新时政新闻</h2>' +
            '<span class="hint">共 ' + DATA.news.items.length + ' 条 · 当前筛选 ' + items.length + ' 条</span></div>';
    h += '<div class="controls">';
    h += '<div class="search-box"><input type="search" id="nwQ" placeholder="搜索标题、摘要、分类…" value="' + esc(STATE.newsQ) + '"></div>';
    h += '</div>';
    h += '<div class="chips" id="nwCats">' +
         chip('全部', STATE.newsCat) + cats.map(function (c) { return chip(c, STATE.newsCat); }).join('') + '</div>';
    h += items.length
      ? '<div class="grid cols-2" style="margin-top:18px">' + items.map(newsCard).join('') + '</div>'
      : emptyBox('没有匹配的条目', '试试放宽筛选条件或换个关键词');
    return h;
  }

  // ---------- 常识页 ----------
  function viewLaw() {
    var cats = uniq(DATA.law.items.map(function (i) { return i.category; }));
    var items = DATA.law.items.filter(function (it) {
      if (STATE.lawCat !== '全部' && it.category !== STATE.lawCat) return false;
      return matchText(it, STATE.lawQ);
    });

    var h = '<div class="section-head"><h2>国考·省考执法类常识</h2>' +
            '<span class="hint">共 ' + DATA.law.items.length + ' 条 · 当前筛选 ' + items.length + ' 条</span></div>';
    h += '<div class="notice"><b>每条均标注法条出处与官方链接。</b>条文序号取自官方发布的现行有效文本；' +
         '无法从官方源核实的考点不予收录。点击「官方链接」可跳转原文自行比对。</div>';
    h += '<div class="controls">';
    h += '<div class="search-box"><input type="search" id="lwQ" placeholder="搜索考点、法条、关键词…" value="' + esc(STATE.lawQ) + '"></div>';
    h += '</div>';
    h += '<div class="chips" id="lwCats">' +
         chip('全部', STATE.lawCat) + cats.map(function (c) { return chip(c, STATE.lawCat); }).join('') + '</div>';

    var groups = {};
    items.forEach(function (it) { (groups[it.category] = groups[it.category] || []).push(it); });
    var keys = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'zh'); });
    if (!keys.length) return h + emptyBox('没有匹配的条目', '试试放宽筛选条件或换个关键词');

    keys.forEach(function (k) {
      h += '<div class="section-head" style="margin-top:26px"><h2 style="font-size:16px">' + esc(k) +
           '</h2><span class="hint">' + groups[k].length + ' 条</span></div>';
      h += '<div class="grid cols-2">' + groups[k].map(lawCard).join('') + '</div>';
    });
    return h;
  }

  function emptyBox(msg, sub) {
    return '<div class="empty"><span class="empty-icon">∅</span>' + esc(msg) +
           '<div style="margin-top:8px;font-size:13px">' + esc(sub || '') + '</div></div>';
  }

  // ---------- 数据来源区块（内嵌于总览页） ----------
  function viewSourcesSection() {
    var h = '<div class="section-head"><h2>数据来源与核验说明</h2>' +
            '<span class="hint">全部条目均可回溯至官方原文</span></div>';

    h += '<div class="notice"><b>本站的编写原则：</b><br>' +
         '1. 所有条目均来自官方渠道的公开页面，不使用二手转述、不使用未经核实的网络流传文本。<br>' +
         '2. 每条必含<strong>发布时间</strong>与<strong>原文链接</strong>，缺一者不予收录。<br>' +
         '3. 「要点」为原文的分类摘录与压缩，不添加原文没有的论断，不作评论。<br>' +
         '4. 讲话原文与指示原文以新华网受权发布版本为准；求是文章以《求是》刊发文本为准。</div>';

    h += '<div class="section-head"><h2>抓取来源一览</h2></div>';
    h += '<div class="table-wrap"><table><thead><tr><th>板块</th><th>官方栏目</th><th>入口地址</th><th>条目数</th></tr></thead><tbody>';

    h += '<tr><td>讲话与指示</td><td>新华网 · 习近平报道专集</td><td>' +
         '<code>' + esc(DATA.speeches.meta.indexUrls.join('<br>')) + '</code></td><td>' +
         DATA.speeches.items.length + '</td></tr>';
    h += '<tr><td>时政新闻</td><td>新华网 · 时政 / 时政联播 / 新华法治</td><td>' +
         '<code>' + esc(DATA.news.meta.indexUrls.join('<br>')) + '</code></td><td>' +
         DATA.news.items.length + '</td></tr>';
    h += '<tr><td>执法常识</td><td>全国人大网 · 中国政府网 · 最高法/最高检</td><td>' +
         '<code>flk.npc.gov.cn · www.gov.cn · www.court.gov.cn · www.spp.gov.cn</code></td><td>' +
         (DATA.law ? DATA.law.items.length : 0) + '</td></tr>';
    h += '</tbody></table></div>';

    h += '<div class="section-head"><h2>讲话栏目明细</h2></div>';
    var byCat = {};
    DATA.speeches.items.forEach(function (i) { byCat[i.category] = (byCat[i.category] || 0) + 1; });
    h += '<div class="chips">' + Object.keys(byCat).map(function (c) {
      return '<span class="chip on" style="cursor:default">' + esc(c) + ' ' + byCat[c] + '</span>';
    }).join('') + '</div>';

    h += '<div class="section-head"><h2>数据快照信息</h2></div>';
    h += '<div class="table-wrap"><table><thead><tr><th>项目</th><th>内容</th></tr></thead><tbody>';
    h += '<tr><td>讲话板块覆盖时段</td><td>' + esc(DATA.speeches.meta.coverage) + '</td></tr>';
    h += '<tr><td>时政板块覆盖时段</td><td>' + esc(DATA.news.meta.coverage) + '</td></tr>';
    h += '<tr><td>数据抓取日期</td><td>' + esc(DATA.speeches.meta.updatedAt) + '</td></tr>';
    h += '<tr><td>讲话板块声明</td><td>' + esc(DATA.speeches.meta.disclaimer) + '</td></tr>';
    h += '<tr><td>时政板块声明</td><td>' + esc(DATA.news.meta.disclaimer) + '</td></tr>';
    if (DATA.law && DATA.law.meta) {
      h += '<tr><td>常识板块说明</td><td>' + esc(DATA.law.meta.disclaimer || '每条标注法条依据与官方来源。') + '</td></tr>';
    }
    h += '</tbody></table></div>';

    if (DATA.law.meta && DATA.law.meta.needsReview && DATA.law.meta.needsReview.length) {
      h += '<div class="notice"><b>⚠ 有 ' + DATA.law.meta.needsReview.length + ' 条法条链接已失效，需人工复核：</b><br>' +
           DATA.law.meta.needsReview.map(function (r) {
             return esc(r.id) + '（' + esc(r.code) + '）' + esc(r.sourceUrl);
           }).join('<br>') + '</div>';
    }
    if (DATA.law.meta && DATA.law.meta.linkWarnings && DATA.law.meta.linkWarnings.length) {
      h += '<div class="notice"><b>ℹ 有 ' + DATA.law.meta.linkWarnings.length +
           ' 条法条链接存在技术性瑕疵（浏览器可正常打开，仅证书链不匹配），已保留但建议人工确认：</b><br>' +
           DATA.law.meta.linkWarnings.map(function (r) {
             return esc(r.id) + '（' + esc(r.code) + '）' + esc(r.sourceUrl);
           }).join('<br>') + '</div>';
    }

    h += '<div class="section-head"><h2>更新与自查方法</h2></div>';
    h += '<div class="grid cols-2 grid-even">';
    h += '<div class="card"><h3 class="card-title">如何自行验证</h3><ul class="bullets">' +
         '<li>每张卡片底部的「原文链接 ↗」直达官方页面，Ctrl/⌘ + 点击在新标签打开</li>' +
         '<li>比对卡片中的日期与原网页发布时间是否一致</li>' +
         '<li>常识板块点击「官方链接」查看法条全文与条号</li>' +
         '<li>若发现不一致，以官方原文为准并告知维护者</li></ul></div>';
    h += '<div class="card"><h3 class="card-title">本站不做什么</h3><ul class="bullets">' +
         '<li>不代替官方发布渠道，转载请注明出处</li>' +
         '<li>不提供法律意见，个案请咨询执业人员</li>' +
         '<li>不收录无法溯源的网络流传版本</li>' +
         '<li>不对原文作立场性评价或延伸解读</li></ul></div>';
    h += '</div>';
    return h;
  }

  // ---------- 动态事件绑定 ----------
  function bindDynamic() {
    var q = $('#spQ');
    if (q) {
      q.addEventListener('input', function () {
        STATE.speechQ = this.value;
        var pos = this.selectionStart;
        render();
        var nq = $('#spQ'); if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
      });
    }
    var nq = $('#nwQ');
    if (nq) {
      nq.addEventListener('input', function () {
        STATE.newsQ = this.value;
        var pos = this.selectionStart;
        render();
        var m = $('#nwQ'); if (m) { m.focus(); m.setSelectionRange(pos, pos); }
      });
    }
    var lq = $('#lwQ');
    if (lq) {
      lq.addEventListener('input', function () {
        STATE.lawQ = this.value;
        var pos = this.selectionStart;
        render();
        var m = $('#lwQ'); if (m) { m.focus(); m.setSelectionRange(pos, pos); }
      });
    }
    $$('[data-chip]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = this.getAttribute('data-val');
        var ns = this.getAttribute('data-chip');
        if (ns === 'y') STATE.speechYear = v;
        else if (ns === 'c') {
          if (STATE.route === '/speeches') STATE.speechCat = v;
          else if (STATE.route === '/news') STATE.newsCat = v;
          else if (STATE.route === '/law') STATE.lawCat = v;
        }
        render();
      });
    });
  }

  // ---------- 瀑布流排布 ----------
  // CSS Grid 细粒度行高 + JS 计算 span。逐列找最短列放置卡片，实现瀑布流。
  var MASONRY = {
    rowHeight: 1,   // 必须与 CSS 的 grid-auto-rows 一致（1px 极细行高）
    gap: 14         // 卡片之间的垂直间距，由 JS 全权算进 span
  };

  function layoutMasonry() {
    // 只处理内容型瀑布流；grid-even 是等高规整组，不参与
    var grids = $$('.grid.cols-2:not(.grid-even)');
    if (!grids.length) return;

    grids.forEach(function (grid) {
      var cards = Array.prototype.slice.call(grid.children);
      if (!cards.length) return;

      // 读取实际列数
      var styles = getComputedStyle(grid);
      var colCount = styles.gridTemplateColumns.split(' ').filter(function (s) {
        return s && s !== 'none';
      }).length;
      if (!colCount || isNaN(colCount)) colCount = 1;

      // 先全部置为自动定位，避免上一轮 span 干扰测量
      cards.forEach(function (c) {
        c.style.gridRowEnd = 'auto';
        c.style.gridColumn = '';
      });

      // 强制回流后测量高度
      var heights = cards.map(function (c) {
        return c.getBoundingClientRect().height;
      });

      // 逐列找当前最矮的一列放置
      var colHeights = new Array(colCount).fill(0);
      cards.forEach(function (c, i) {
        var target = 0;
        for (var k = 1; k < colCount; k++) {
          if (colHeights[k] < colHeights[target] - 0.5) target = k;
        }
        var h = heights[i];
        // CSS 中 grid-auto-rows: 1px 且 row-gap: 0，因此 Grid 的 span N 行
        // 实际占据 N 像素，可精确换算到 1px 精度：
        //   span = 内容高 + 卡片间距
        // 卡片用 align-self: start 贴行顶，多出的这段就是卡片之间的间距，
        // 不存在"多余空白缝隙"。
        var span = Math.max(1, Math.ceil(h + MASONRY.gap));
        var occupied = span * MASONRY.rowHeight;   // Grid 实际占位高度
        c.style.gridRowEnd = 'span ' + span;
        c.style.gridColumn = (target + 1) + ' / span 1';
        // 用"占位高"推进列高，误差不累积，列更均衡
        colHeights[target] += occupied;
      });
    });
  }

  var masonryTimer = null;
  function scheduleMasonry() {
    if (masonryTimer) clearTimeout(masonryTimer);
    // 等字体与图片加载完成后再排，避免高度变化导致错位
    masonryTimer = setTimeout(function () {
      layoutMasonry();
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(layoutMasonry);
      }
    }, 30);
  }

  // ---------- 主题 ----------
  function initTheme() {
    var saved = localStorage.getItem('wb-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    var btn = $('#themeToggle');
    if (btn) btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', cur);
      localStorage.setItem('wb-theme', cur);
      // 换主题后字号与行高可能变化，需重排瀑布流
      scheduleMasonry();
    });
  }

  // ---------- 启动 ----------
  function boot() {
    initTheme();
    var top = document.createElement('button');
    top.className = 'to-top'; top.textContent = '↑'; top.setAttribute('aria-label', '回到顶部');
    top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.body.appendChild(top);
    window.addEventListener('scroll', function () {
      top.classList.toggle('show', window.scrollY > 400);
    });
    // 列数随窗口宽度变化，需重新排布；防抖避免拖动时高频计算
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(scheduleMasonry, 150);
    });

    Promise.all([
      fetch('data/speeches.json').then(function (r) { return r.json(); }),
      fetch('data/news.json').then(function (r) { return r.json(); }),
      fetch('data/law-knowledge.json').then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      DATA.speeches = res[0]; DATA.news = res[1]; DATA.law = res[2];
      if (!DATA.law) {
        DATA.law = {
          meta: { disclaimer: '常识题库正在核验中。' },
          items: []
        };
      }
      var fu = $('#footUpdated');
      if (fu) fu.textContent = DATA.speeches.meta.updatedAt;
      window.addEventListener('hashchange', routeFromHash);
      routeFromHash();
    }).catch(function (e) {
      $('#app').innerHTML = '<div class="empty"><span class="empty-icon">⚠</span>数据加载失败：' +
        esc(e.message) + '<div style="margin-top:10px;font-size:13px">请通过本地 HTTP 服务访问（file:// 协议下 fetch 会被浏览器拦截）。</div></div>';
    });
  }

  function routeFromHash() {
    var h = (location.hash || '#/').replace('#', '');
    STATE.route = h === '' ? '/' : h;
    if (['/', '/speeches', '/news', '/law'].indexOf(STATE.route) === -1) STATE.route = '/';
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
