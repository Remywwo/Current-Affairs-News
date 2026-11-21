#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检测数据文件是否发生了「实质变化」。

为什么需要单独一个脚本：
  更新流水线每次运行都会刷新 meta.updatedAt 和 meta.lastRun.at（运行时间戳），
  这两个字段**每次都变**，但它们不是内容变化。如果直接用 `git diff -- data/`
  判断，就永远会认为"有变化"，导致每天产生一个内容完全相同的空提交。

本脚本只比较真正影响读者看到的内容的部分：
  - items 数组（标题、要点、链接、正文……）
  - meta.needsReview（法条失效待复核清单）
  - meta.linkWarnings（链接告警清单）

忽略的字段（仅记录运行状态，不影响内容）：
  - meta.updatedAt
  - meta.lastRun

用法：
  python3 scripts/check-changes.py            # 有变化返回 0，无变化返回 1
  python3 scripts/check-changes.py --verbose   # 额外打印差异明细
"""

import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')

FILES = ['speeches.json', 'news.json', 'law-knowledge.json']

# 这些字段只反映「运行状态」，不反映「内容」，比较时忽略
VOLATILE_META = ['updatedAt', 'lastRun']


def substantive(data):
    """抽取需要比较的实质内容"""
    items = data.get('items', [])
    meta = data.get('meta', {})
    return {
        'items': items,
        'needsReview': meta.get('needsReview', []),
        'linkWarnings': meta.get('linkWarnings', []),
    }


def main():
    verbose = '--verbose' in sys.argv
    changed_files = []

    for name in FILES:
        path = os.path.join(DATA_DIR, name)
        if not os.path.exists(path):
            print(f'  [跳过] {name} 不存在')
            continue

        with open(path, encoding='utf-8') as f:
            cur = json.load(f)

        # 与 HEAD 版本比较（CI 中 git 已 checkout 出 HEAD）
        rel = os.path.join('data', name)
        try:
            head_raw = os.popen(f'git show HEAD:{rel} 2>/dev/null').read()
            head = json.loads(head_raw) if head_raw.strip() else None
        except (ValueError, OSError):
            head = None

        if head is None:
            # 首次提交，无历史可比
            changed_files.append(name)
            print(f'  [新增] {name}（首次提交）')
            continue

        cur_sub = substantive(cur)
        head_sub = substantive(head)

        if cur_sub == head_sub:
            # 实质内容相同 —— 即使时间戳变了也不算变化
            volatile = [k for k in VOLATILE_META if cur.get('meta', {}).get(k) != head.get('meta', {}).get(k)]
            if volatile and verbose:
                print(f'  [无变化] {name}（仅时间戳变动：{", ".join(volatile)}）')
            else:
                print(f'  [无变化] {name}')
        else:
            changed_files.append(name)
            print(f'  [有变化] {name}')
            if verbose:
                ci, hi = cur_sub['items'], head_sub['items']
                if len(ci) != len(hi):
                    print(f'      条目数 {len(hi)} → {len(ci)}')
                ids_c = {i.get('id') for i in ci}
                ids_h = {i.get('id') for i in hi}
                added = ids_c - ids_h
                removed = ids_h - ids_c
                if added:
                    print(f'      新增 {len(added)} 条')
                if removed:
                    print(f'      移除 {len(removed)} 条')
                for k in ('needsReview', 'linkWarnings'):
                    if cur_sub[k] != head_sub[k]:
                        print(f'      {k} 有变化')

    if changed_files:
        print(f'\n  结论：有实质变化（{len(changed_files)} 个文件）')
        return 0
    print('\n  结论：无实质变化')
    return 1


if __name__ == '__main__':
    sys.exit(main())
