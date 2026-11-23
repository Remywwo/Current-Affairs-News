#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
校验数据文件确实被本次运行写入了「当天」。

为什么需要这个脚本：
   定时任务最隐蔽的失败不是「报错」，而是「跑了但什么也没写」——
   job 显示绿色，页面上的「数据快照」却停在几天前，没有任何人会收到通知。

   update.py 在**非试运行**模式下，无论有没有新增条目，都会把
   meta.updatedAt 刷成当天（见 update_speeches / update_news /
   check_law_versions 三处）。所以「updatedAt != 今天」只有一种含义：
   写入路径实际没走到 —— 脚本中途异常、数据目录解析错、写入被跳过，等等。

   把它做成显式断言，静默失败就会变成红色构建；
   GitHub 会对失败的定时运行发邮件，问题因此变得可见。

与 check-changes.py 的分工：
   check-freshness.py  在**提交前**跑，回答「这次更新到底写没写」；
   check-changes.py    回答「写进来的东西值不值得提交」。
   两者互不替代：后者会把「只有时间戳变动」判为无变化而跳过提交，
   那是刻意设计（避免每日空提交），不代表更新失败。

用法：
    python3 scripts/check-freshness.py                  # 要求就是今天（北京时间）
    python3 scripts/check-freshness.py --date 2026-11-23
    python3 scripts/check-freshness.py --max-age 2      # 容忍落后 2 天，供本地排查

退出码：0 通过 / 1 不通过
"""

import argparse
import datetime
import json
import os
import sys

try:
    from zoneinfo import ZoneInfo
except ImportError:  # Python < 3.9
    ZoneInfo = None

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 数据目录：兼容 src/data/ 与 public/data/ 两种布局
# （与 update.py / check-changes.py 保持同一套探测逻辑）
_DATA_CANDIDATES = [
    os.path.join(BASE_DIR, 'src', 'data'),
    os.path.join(BASE_DIR, 'public', 'data'),
    os.path.join(BASE_DIR, 'data'),
]
DATA_DIR = next((d for d in _DATA_CANDIDATES if os.path.isdir(d)), _DATA_CANDIDATES[0])

FILES = ['speeches.json', 'news.json', 'law-knowledge.json']


def cn_today():
    """北京时间的今天。CI 机器是 UTC，直接取 date.today() 会在早上 8 点前差一天。"""
    if ZoneInfo is not None:
        return datetime.datetime.now(ZoneInfo('Asia/Shanghai')).date()
    # 兜底：UTC + 8 小时
    return (datetime.datetime.now(datetime.timezone.utc) +
            datetime.timedelta(hours=8)).date()


def main():
    ap = argparse.ArgumentParser(description='校验数据快照日期是否为当天')
    ap.add_argument('--date', help='期望的抓取日期 YYYY-MM-DD，默认今天（北京时间）')
    ap.add_argument('--max-age', type=int, default=0,
                    help='允许数据落后多少天，默认 0（必须是当天）')
    args = ap.parse_args()

    if args.date:
        try:
            base = datetime.date.fromisoformat(args.date)
        except ValueError:
            print(f'✗ --date 格式非法：{args.date!r}（应为 YYYY-MM-DD）')
            return 1
    else:
        base = cn_today()

    bad = []
    for name in FILES:
        path = os.path.join(DATA_DIR, name)
        if not os.path.exists(path):
            bad.append(f'{name}: 文件不存在（{path}）')
            continue
        try:
            with open(path, encoding='utf-8') as f:
                got = json.load(f).get('meta', {}).get('updatedAt')
        except (OSError, ValueError) as e:
            bad.append(f'{name}: 读取失败（{type(e).__name__}: {e}）')
            continue

        if not got:
            bad.append(f'{name}: meta.updatedAt 缺失')
            continue

        try:
            age = (base - datetime.date.fromisoformat(got)).days
        except ValueError:
            bad.append(f'{name}: updatedAt={got!r} 不是 YYYY-MM-DD')
            continue

        if age > args.max_age:
            bad.append(f'{name}: updatedAt={got}，落后 {age} 天（允许 {args.max_age}）')

    if bad:
        print('✗ 数据未按预期写入：')
        for b in bad:
            print('  ' + b)
        return 1

    print(f'✓ 数据快照日期正常（基准 {base}，允许落后 {args.max_age} 天）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
