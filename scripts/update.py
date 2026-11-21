#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
时政与执法常识学习站 — 数据更新流水线

三步走：
  1. 抓取：从固定官方栏目列表页解析新条目（标题 / 日期 / 原文链接）
  2. 核验：对每个候选链接发起 HTTP 请求，状态码非 200/3xx 的直接丢弃，绝不写入数据
  3. 合并：与现有 JSON 比对，只追加新条目，保留人工补充的要点与法条依据

设计原则：**宁可不收录，也不可编造**。任何解析不出、链接不通、日期缺失的条目一律丢弃，
并在末尾打印"已丢弃"清单，让遗漏是可见的而不是静默的。

仅用 Python 标准库，无需安装依赖。
"""

import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 数据目录：兼容 src/data/ 与 public/data/ 两种布局
# （前端用 Vite 构建，JSON 由 src/data/ 直接静态引入打包）
_DATA_CANDIDATES = [
    os.path.join(BASE_DIR, 'src', 'data'),
    os.path.join(BASE_DIR, 'public', 'data'),
    os.path.join(BASE_DIR, 'data'),
]
DATA_DIR = next((d for d in _DATA_CANDIDATES if os.path.isdir(d)), _DATA_CANDIDATES[0])

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

CN_TZ = timezone(timedelta(hours=8))

# ---------------------------------------------------------------- 已人工确认的链接
#
# 这些链接的服务器使用了通用证书（证书 CN 与域名不符），严格校验证书链的
# 客户端会报 TLS 错误，但浏览器可正常打开、内容完整有效 —— 已逐一实测确认。
#
# 收录在这里是为了让它们不再反复触发 linkWarnings 告警。
# 收录条件（必须都满足）：
#   1. 放宽校验后返回 200，且页面确实是目标内容（标题、正文可读）
#   2. 人工确认内容无误（法条条文与本站条目一致）
#
VERIFIED_TLS_URLS = {
    # 《中华人民共和国民法典》全文 — 人民网法治频道
    # 证书 CN 为 default.chinanetcenter.com，与域名不符；页面为 GB18030 编码，
    # 浏览器可正常打开，已确认正文为民法典全文。
    'https://legal.people.com.cn/n1/2020/0602/c42510-31731656.html',
}

# ---------------------------------------------------------------- 源配置

SPEECH_SOURCES = [
    # (栏目键, 列表页 URL, 条目分类, 专题)
    ('jhqw', 'https://www.news.cn/politics/leaders/xijinping/jhqw.htm', '重要讲话', '讲话全文'),
    ('zywz', 'https://www.news.cn/politics/leaders/xijinping/zywz.htm', '重要文章', '求是文章'),
    ('zsps', 'https://www.news.cn/politics/leaders/xijinping/zsps.htm', '重要指示', '指示批示'),
    ('zdzx', 'https://www.news.cn/politics/leaders/xijinping/zdzx.htm', '致电致信', '致电致信'),
    ('hyhd', 'https://www.news.cn/politics/leaders/xijinping/hyhd.htm', '国事活动', '会议活动'),
    ('kcdy', 'https://www.news.cn/politics/leaders/xijinping/kcdy.htm', '考察调研', '考察调研'),
]

NEWS_SOURCES = [
    ('szlb', 'https://www.news.cn/politics/szlb/index.html', '时政联播'),
    ('legal', 'https://www.news.cn/legal/index.html', '新华法治'),
]

# 注意：新华网时政首页 https://www.news.cn/politics/ 是纯 JS 渲染，
# 服务端返回的 HTML 中不含任何日期与列表结构，无法静态解析，因此不作为源。
# 若将来该页改为服务端渲染，可在此重新加入。

# 解析器：兼容两种页面结构
#   结构 A: <li><div class="tit"><a href=..>T</a></div><div class="time">D</div></li>
#   结构 B: <div class="item"><span><a href=..>T</a></span><div class="time">D</div></div>
RE_ITEM_A = re.compile(
    r'<li[^>]*>\s*<div class="tit">\s*<a href=[\'"]([^\'"]+)[\'"][^>]*>(.*?)</a></div>'
    r'\s*<div class="time">\s*(\d{4}-\d{2}-\d{2})',
    re.S)
RE_ITEM_B = re.compile(
    r'<div class="item[^"]*">(?:(?!<div class="item).){0,3000}?'
    r'<a href=[\'"]([^\'"]+)[\'"][^>]*>(.*?)</a>'
    r'(?:(?!<div class="item).){0,1500}?'
    r'<div class="time">\s*(\d{4}-\d{2}-\d{2})',
    re.S)
RE_TAG = re.compile(r'<[^>]+>')

# 宽松上下文：用于解析页面内容（部分政府站点证书链不规范）
_ctx = ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = ssl.CERT_NONE

# 严格上下文：用于链接校验，只有严格通过才算"干净"的链接
_ctx_strict = ssl.create_default_context()


# ---------------------------------------------------------------- 工具

def decode_html(raw, header_charset=None):
    """
    解码 HTML。中文站点编码不统一：新华网是 UTF-8，人民网是 GB18030/GBK，
    若一律按 UTF-8 解码会得到乱码，解析结果全部失真。因此按优先级探测：
      1. HTTP 响应头 charset
      2. HTML meta 标签声明的 charset
      3. 依次尝试 utf-8 → gb18030 → gbk，用"中文常用字能否正常解码"判定
    """
    candidates = []
    if header_charset:
        candidates.append(header_charset)
    m = re.search(rb'charset=["\']?\s*([\w-]+)', raw[:4096], re.I)
    if m:
        candidates.append(m.group(1).decode('ascii', 'ignore'))
    candidates += ['utf-8', 'gb18030', 'gbk']

    seen = set()
    for enc in candidates:
        enc = enc.lower().strip()
        if enc in seen:
            continue
        seen.add(enc)
        try:
            text = raw.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
        # 中文站点有效性判据：能解出中文常用字且不含大量替换字符
        if '�' in text[:5000]:
            continue
        if re.search(r'[一-鿿]', text[:20000]):
            return text
    return raw.decode('utf-8', errors='ignore')


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    })
    with urllib.request.urlopen(req, timeout=timeout, context=_ctx) as r:
        raw = r.read()
        charset = r.headers.get_content_charset()
        return decode_html(raw, charset)


def clean_text(s):
    s = RE_TAG.sub('', s)
    # 常见 HTML 实体（含 &emsp; &ensp; &ldquo; &rdquo; 等）
    s = (s.replace('&nbsp;', ' ').replace('&emsp;', '').replace('&ensp;', '')
          .replace('&ldquo;', '“').replace('&rdquo;', '”')
          .replace('&lsquo;', '‘').replace('&rsquo;', '’')
          .replace('&mdash;', '—').replace('&hellip;', '…')
          .replace('&amp;', '&').replace('&lt;', '<')
          .replace('&gt;', '>').replace('&quot;', '"'))
    return re.sub(r'\s+', ' ', s).strip()


def abs_url(u, base):
    if u.startswith('//'):
        return 'https:' + u
    if u.startswith('http'):
        return u
    return urllib.parse.urljoin(base, u)


def check_link(url, timeout=12):
    """
    返回 (状态, 代码或描述)。状态取值：
      'ok'      —— 正常返回 2xx/3xx
      'warn'    —— 链接可用但存在技术性瑕疵（TLS 证书链不匹配等），浏览器可正常打开
      'bad'     —— 真正的失效（404/超时/无法解析），必须丢弃

    区分 'warn' 与 'bad' 很重要：部分政府站点使用通用证书
    （如 legal.people.com.cn 的证书 CN 为 default.chinanetcenter.com），
    严格校验证书链的客户端会报 TLS 错误，但浏览器实际可正常访问。
    把这类误判为失效，会导致有价值的官方来源被错误丢弃。
    """
    tls_issue = None
    for method in ('HEAD', 'GET'):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA}, method=method)
            with urllib.request.urlopen(req, timeout=timeout, context=_ctx_strict) as r:
                code = r.getcode()
                if 200 <= code < 400:
                    return 'ok', code
                if code in (403, 405, 501) and method == 'HEAD':
                    continue
                return 'bad', code
        except urllib.error.HTTPError as e:
            if e.code in (403, 405, 501) and method == 'HEAD':
                continue
            return 'bad', e.code
        except Exception as e:
            # 证书链问题常被包装成 URLError / SSLError，需要展开识别，
            # 否则会与真正的网络故障混为一谈，导致有价值的官方源被误丢。
            reason = e.reason if isinstance(e, urllib.error.URLError) else e
            is_tls = isinstance(reason, ssl.SSLCertVerificationError) or \
                     (isinstance(reason, ssl.SSLError) and 'CERTIFICATE_VERIFY_FAILED' in str(reason))
            if is_tls:
                tls_issue = 'TLS证书链不匹配'
                lax = ssl.create_default_context()
                lax.check_hostname = False
                lax.verify_mode = ssl.CERT_NONE
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': UA}, method='GET')
                    with urllib.request.urlopen(req, timeout=timeout, context=lax) as r:
                        r.read(2048)
                        if 200 <= r.getcode() < 400:
                            return 'warn', tls_issue
                except Exception:
                    pass
                if method == 'HEAD':
                    continue
                return 'bad', tls_issue
            if method == 'HEAD':
                continue
            return 'bad', getattr(e, 'code', None) or type(e).__name__
    return 'bad', 'unreachable'


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def now_cn():
    return datetime.now(CN_TZ).strftime('%Y-%m-%d')


# ---------------------------------------------------------------- 抓取

def parse_list(html, base_url):
    """从列表页 HTML 提取 (标题, 日期, 链接) 列表"""
    out = []
    seen = set()
    for pat in (RE_ITEM_A, RE_ITEM_B):
        for url, title, date in pat.findall(html):
            url = abs_url(url, base_url)
            if url in seen:
                continue
            title = clean_text(title)
            if not title or not date:
                continue
            seen.add(url)
            out.append((title, date, url))
        if out:
            break
    return out


def fetch_speech_candidates():
    cands = []
    for key, url, category, topic in SPEECH_SOURCES:
        try:
            html = http_get(url)
        except Exception as e:
            print(f'  ! 抓取失败 {key}: {e}')
            continue
        items = parse_list(html, url)
        print(f'  · {key:6s} 解析 {len(items):3d} 条  ({category})')
        for title, date, link in items:
            cands.append({
                'id': 'sp-' + date + '-' + hashlib_short(link),
                'date': date, 'category': category, 'topic': topic,
                'title': title, 'subtitle': None, 'place': None,
                'source': '新华社 / 新华网', 'sourceUrl': link,
                'keyPoints': [], 'quote': None,
            })
    return cands


def fetch_news_candidates():
    cands = []
    for key, url, category in NEWS_SOURCES:
        try:
            html = http_get(url)
        except Exception as e:
            print(f'  ! 抓取失败 {key}: {e}')
            continue
        items = parse_list(html, url)
        print(f'  · {key:6s} 解析 {len(items):3d} 条  ({category})')
        for title, date, link in items:
            cands.append({
                'id': 'nw-' + date + '-' + hashlib_short(link),
                'date': date, 'category': category,
                'title': title, 'summary': None,
                'source': '新华社 / 新华网', 'sourceUrl': link,
            })
    # 时政首页为纯 JS 渲染，静态 HTML 无列表结构，故不作为源（见上方说明）
    return cands


def hashlib_short(s):
    import hashlib
    return hashlib.md5(s.encode('utf-8')).hexdigest()[:8]


# ---------------------------------------------------------------- 要点抽取

# 电头行，如"新华社北京11月17日电"，以及纯图片/版权等噪声
RE_WIRE = re.compile(r'^(新华社|中新社|本报|新华社记者|记者)[^，。]{0,30}(电|讯)')
NOISE = re.compile(r'^(责任编辑|责编|编辑|来源|扫码|关注|分享|声明|版权|新华社发|图片来源|\s*$)')
# 图注：含"新华社记者 X 摄"，或以破折号开头的标题行
RE_CAPTION = re.compile(r'(新华社记者\s*\S+\s*摄|摄$|^——|^〔|^图：)')
# 讲话/文章正文的常见引导词，命中说明这段是实质内容
SIGNAL = re.compile(
    r'(强调|指出|要求|提出|明确|部署|强调要|指出，|要求，|强调，|'
    r'要坚定不移|必须|应当|第一|第二|第三|第四|第五|第六|'
    r'会议指出|会议强调|决定|审议通过|提出|强调要)')


def extract_points(url, max_points=6):
    """
    抓取原文并按段落切分，抽取要点。
    纯机械摘录，不改写、不归纳、不加评论——每条要点都是原文句子的截取。
    """
    try:
        html = http_get(url)
    except Exception:
        return []
    paras = re.findall(r'<p[^>]*>(.*?)</p>', html, re.S)
    points = []
    for p in paras:
        t = clean_text(p)
        if len(t) < 24 or len(t) > 300:
            continue
        if NOISE.match(t) or RE_WIRE.match(t) or RE_CAPTION.search(t):
            continue
        # 去掉段首的电头
        t = re.sub(r'^新华社[^，。]{0,30}电\s*', '', t)
        # 落款行：单独的日期、署名、"习近平"
        if re.match(r'^(习近平|[\d]{4}年\d{1,2}月\d{1,2}日|第[一二三四五六七八九十]+条)$', t):
            continue
        # 贺信/致辞类文本没有"强调/指出"等信号词，段落本身即是实质内容，
        # 因此以"排除电头/落款/图注"为主，只在段落过短时才丢弃。
        if len(t) < 20:
            continue
        points.append(t)
        if len(points) >= max_points:
            break
    return points


# ---------------------------------------------------------------- 核验

def verify(cands, workers=6):
    """
    逐条校验链接。返回 (可用列表, 丢弃清单, 警告清单)
    - 'ok'   正常 → 收录
    - 'warn' 技术性瑕疵但浏览器可打开 → 收录，打上标记
    - 'bad'  真正失效 → 丢弃
    """
    ok, dropped, warned = [], [], []
    print(f'  开始校验 {len(cands)} 个链接（并发 {workers}）…')
    for i in range(0, len(cands), workers):
        batch = cands[i:i + workers]
        for c in batch:
            state, code = check_link(c['sourceUrl'])
            if state == 'bad':
                dropped.append((c, code))
            else:
                c['_code'] = code
                if state == 'warn':
                    c['_warn'] = code
                    warned.append((c, code))
                ok.append(c)
        done = min(i + workers, len(cands))
        print(f'\r    已校验 {done}/{len(cands)}  可用 {len(ok)}  警告 {len(warned)}  丢弃 {len(dropped)}', end='')
        time.sleep(0.05)
    print()
    return ok, dropped, warned


# ---------------------------------------------------------------- 合并

def merge_speech(existing, incoming, with_points=True):
    """保留已有条目的要点等人工内容；仅追加真正的新链接"""
    by_url = {i['sourceUrl']: i for i in existing['items']}
    added = 0
    for c in incoming:
        if c['sourceUrl'] in by_url:
            continue
        c['id'] = 'sp-' + c['date'] + '-' + hashlib_short(c['sourceUrl'])
        if with_points and not c.get('keyPoints'):
            pts = extract_points(c['sourceUrl'])
            if pts:
                c['keyPoints'] = pts
                c['autoPoints'] = True   # 标记为机器抽取，便于人工润色
        existing['items'].append(c)
        by_url[c['sourceUrl']] = c
        added += 1
    existing['items'].sort(key=lambda x: x.get('date', ''), reverse=True)
    return added


def merge_news(existing, incoming, with_points=True):
    """保留已有条目的摘要等人工内容；仅追加真正的新链接

    质量闸门：抽不到摘要的条目一律不入库。
    「新华社快讯」这类页面正文由 JS 注入，服务端 HTML 里没有正文段落，
    抽出来的卡片会只有标题没有内容。与其收一堆空壳，不如不收——
    与「链接不通即丢弃」是同一条原则：宁可不收录，也不可编造。
    """
    by_url = {i['sourceUrl']: i for i in existing['items']}
    added = 0
    dropped_empty = []
    for c in incoming:
        if c['sourceUrl'] in by_url:
            continue
        c['id'] = 'nw-' + c['date'] + '-' + hashlib_short(c['sourceUrl'])
        if with_points and not c.get('summary'):
            pts = extract_points(c['sourceUrl'], max_points=2)
            if pts:
                # 新闻摘要取前两句，拼成一段概述（仍是原文句子的截取）
                c['summary'] = ' '.join(pts[:2])[:300]
                c['autoSummary'] = True
        if with_points and not c.get('summary'):
            # 抽不到正文 —— 丢弃，不收空壳
            dropped_empty.append(c)
            continue
        existing['items'].append(c)
        by_url[c['sourceUrl']] = c
        added += 1
    existing['items'].sort(key=lambda x: x.get('date', ''), reverse=True)
    return added, dropped_empty


# ---------------------------------------------------------------- 主流程

def update_speeches(dry=False):
    path = os.path.join(DATA_DIR, 'speeches.json')
    existing = load_json(path)
    print(f'\n[1/3] 讲话与指示 — 现有 {len(existing["items"])} 条')
    cands = fetch_speech_candidates()
    ok, dropped, warned = verify(cands)
    # 先算出待新增数量，试运行下也能如实汇报
    have = {i['sourceUrl'] for i in existing['items']}
    pending = [c for c in ok if c['sourceUrl'] not in have]
    added = 0 if dry else merge_speech(existing, ok)
    if not dry:
        existing['meta']['updatedAt'] = now_cn()
        existing['meta']['lastRun'] = {
            'at': now_cn(), 'candidates': len(cands),
            'linkOk': len(ok), 'dropped': len(dropped), 'added': added,
        }
        save_json(path, existing)
    verb = '待新增' if dry else '新增'
    print(f'  {verb} {len(pending) if dry else added} 条，警告 {len(warned)} 条，丢弃 {len(dropped)} 条')
    if dry and pending:
        print('  待新增条目预览（前 8 条）：')
        for c in pending[:8]:
            print(f'    · [{c["date"]}] {c["title"][:40]}')
    return dropped, warned


def update_news(dry=False):
    path = os.path.join(DATA_DIR, 'news.json')
    existing = load_json(path)
    print(f'\n[2/3] 时政新闻 — 现有 {len(existing["items"])} 条')
    cands = fetch_news_candidates()
    ok, dropped, warned = verify(cands)
    have = {i['sourceUrl'] for i in existing['items']}
    pending = [c for c in ok if c['sourceUrl'] not in have]
    empty_dropped = []
    if dry:
        added = 0
    else:
        added, empty_dropped = merge_news(existing, ok)
    if not dry:
        existing['meta']['updatedAt'] = now_cn()
        existing['meta']['lastRun'] = {
            'at': now_cn(), 'candidates': len(cands),
            'linkOk': len(ok), 'dropped': len(dropped), 'added': added,
        }
        save_json(path, existing)
    verb = '待新增' if dry else '新增'
    print(f'  {verb} {len(pending) if dry else added} 条，警告 {len(warned)} 条，丢弃 {len(dropped)} 条')
    if dry and pending:
        print('  待新增条目预览（前 8 条）：')
        for c in pending[:8]:
            print(f'    · [{c["date"]}] {c["title"][:40]}')
    if empty_dropped:
        print(f'  另有 {len(empty_dropped)} 条抽不到正文（快讯类），已丢弃：')
        for c in empty_dropped[:5]:
            print(f'    · [{c["date"]}] {c["title"][:40]}')
    return dropped, warned


def check_law_versions(dry=False):
    """
    法条时效体检：
    对每条常识的 sourceUrl 做一次 HTTP 校验，并抽取页面中的年份线索，
    若链接失效则标记为 needsReview（不自动删除，交人工确认）。

    dry=True 时只体检不写盘（供试运行 / CI 校验使用）。
    """
    path = os.path.join(DATA_DIR, 'law-knowledge.json')
    data = load_json(path)
    print(f'\n[3/3] 执法常识 — 现有 {len(data["items"])} 条')
    bad = []
    warned = []
    for i, it in enumerate(data['items'], 1):
        state, code = check_link(it['sourceUrl'])
        if state == 'bad':
            bad.append((it['id'], code, it['sourceUrl']))
        elif state == 'warn':
            # 已人工确认过的链接不再重复告警：
            # 这些链接虽然证书链有瑕疵，但浏览器可正常打开、内容完整有效，
            # 属于站点自身的 TLS 兼容性问题而非链接失效。
            if it['sourceUrl'] in VERIFIED_TLS_URLS:
                continue
            warned.append((it['id'], code, it['sourceUrl']))
        print(f'\r    校验中 {i}/{len(data["items"])}  失效 {len(bad)}  警告 {len(warned)}', end='')
    print()
    if bad:
        data['meta']['needsReview'] = [
            {'id': i, 'code': c, 'sourceUrl': u, 'note': '链接已失效，需人工复核该条法条依据'}
            for i, c, u in bad
        ]
    else:
        data['meta'].pop('needsReview', None)
    if warned:
        data['meta']['linkWarnings'] = [
            {'id': i, 'code': c, 'sourceUrl': u,
             'note': '链接可用但证书链不匹配（浏览器可正常打开），建议人工确认后保留'}
            for i, c, u in warned
        ]
    else:
        data['meta'].pop('linkWarnings', None)
    data['meta']['updatedAt'] = now_cn()
    data['meta']['lastRun'] = {
        'at': now_cn(), 'total': len(data['items']),
        'invalidLinks': len(bad), 'warnLinks': len(warned),
    }
    if dry:
        print('  [试运行] 不写入文件')
    else:
        save_json(path, data)
    print(f'  链接失效 {len(bad)} 条' + ('（已标记 needsReview）' if bad else '') +
          f'，警告 {len(warned)} 条')
    return bad


def main():
    dry = '--dry-run' in sys.argv
    print('=' * 62)
    print('  时政与执法常识学习站 · 数据更新流水线')
    print(f'  时间 {now_cn()}  模式 {"试运行（不写入）" if dry else "正式写入"}')
    print('=' * 62)

    t0 = time.time()
    d1, w1 = update_speeches(dry)
    d2, w2 = update_news(dry)
    d3 = check_law_versions(dry)

    print('\n' + '=' * 62)
    print(f'  完成，耗时 {time.time() - t0:.1f}s')
    total_dropped = len(d1) + len(d2)
    total_warned = len(w1) + len(w2)
    if total_dropped:
        print(f'\n  已丢弃 {total_dropped} 条（链接不可达，不予收录）：')
        for c, code in (d1 + d2)[:20]:
            print(f'    [{code}] {c["date"]} {c["title"][:36]}')
        if total_dropped > 20:
            print(f'    … 其余 {total_dropped - 20} 条省略')
    else:
        print('\n  丢弃 0 条 —— 所有候选链接均可达')
    if total_warned:
        print(f'\n  警告 {total_warned} 条（链接可用但证书链不匹配，浏览器可正常打开）：')
        for c, code in (w1 + w2)[:10]:
            print(f'    [{code}] {c["date"]} {c["title"][:36]}')
    if d3:
        print(f'\n  常识链接失效 {len(d3)} 条，已标记 needsReview：')
        for i, c, u in d3[:10]:
            print(f'    [{c}] {i}  {u[:70]}')
    print('=' * 62)


if __name__ == '__main__':
    main()
