#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""占位值重测：持续率阈值(65%) 与 妹妹成长封顶(T=30) 的真实数据分布
纯分析脚本，不改任何源代码/数据。
用法: .venv/Scripts/python.exe tests/analyze_thresholds.py
"""
import sqlite3

conn = sqlite3.connect('data/stats.db')
conn.row_factory = sqlite3.Row

# ═══ 1. 姐妹关系持续率分布（按姐姐） ═══
# 口径: Σ(已结束团实际存续天数, 毕业clamp30) ÷ (已结束团数 × 30) × 100%
# 已结束 = dissolve_date 非空；存续天数 = dissolve_date - form_date（快照滞后允许 31/32 归为毕业）
rows = conn.execute('''
    SELECT CAST(sister_uid AS TEXT) AS su, team_id, form_date, dissolve_date, dissolve_reason
    FROM team_detail
    WHERE rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id, snapshot_date)
      AND sister_uid IS NOT NULL AND sister_uid != ''
''').fetchall()

# 每团取最新状态（dissolve_date 以最后一次快照为准）
teams = {}
for r in rows:
    teams[r['team_id']] = r  # rowid 最大者最后写入覆盖

from datetime import date

def parse(s):
    try:
        return date.fromisoformat((s or '')[:10])
    except Exception:
        return None

per_captain = {}
for t in teams.values():
    fd, dd = parse(t['form_date']), parse(t['dissolve_date'])
    if not fd or not dd:
        continue  # 进行中团不进分子分母
    days = (dd - fd).days
    is_grad = (t['dissolve_reason'] == '毕业') or days >= 30
    dur = 30 if is_grad else max(0, days)
    c = per_captain.setdefault(t['su'], {'ended': 0, 'dur_sum': 0})
    c['ended'] += 1
    c['dur_sum'] += dur

rates = []
for su, c in per_captain.items():
    if c['ended'] >= 1:
        rates.append((su, c['ended'], c['dur_sum'] / (c['ended'] * 30) * 100))

rates.sort(key=lambda x: x[2])
n = len(rates)
vals = [r[2] for r in rates]

def pct(p):
    return round(vals[min(n - 1, int(n * p))], 1) if n else 0

print('═' * 56)
print('1. 姐妹关系持续率分布（全部已结束团的姐姐）')
print('═' * 56)
print(f'姐姐数（有已结束团）: {n}')
for p in (0.25, 0.5, 0.75, 0.9, 0.95):
    print(f'  P{int(p*100)}: {pct(p)}%')
for th in (50, 60, 65, 70, 75, 80):
    cnt = sum(1 for v in vals if v >= th)
    print(f'  ≥{th}%: {cnt} 人（{cnt/n*100:.0f}%）')

# 至少 2 个已结束团的姐姐（减少单团噪音）
rates2 = [r for r in rates if r[1] >= 2]
vals2 = sorted(r[2] for r in rates2)
n2 = len(vals2)
print(f'\n仅统计已结束团 ≥2 的姐姐: {n2} 人')
def pct2(p):
    return round(vals2[min(n2 - 1, int(n2 * p))], 1) if n2 else 0
for p in (0.25, 0.5, 0.75, 0.9, 0.95):
    print(f'  P{int(p*100)}: {pct2(p)}%')
for th in (60, 65, 70):
    cnt = sum(1 for v in vals2 if v >= th)
    print(f'  ≥{th}%: {cnt} 人（{cnt/n2*100:.0f}%）')

# ═══ 2. 妹妹成长分/月分布（按姐姐） ═══
# 口径: 每团 gr = MAX(妹妹等级难度加权分) - MIN(...)；每月成长分 = mean(gr/团龄天数) × 30
SCORE = """CASE sister_max_level2 WHEN '大神' THEN 64 WHEN '王牌' THEN 32 WHEN '金牌' THEN 16
        WHEN '银牌' THEN 8 WHEN '初级银牌' THEN 4 WHEN '铜牌' THEN 2 WHEN '初级铜牌' THEN 1 ELSE 0 END"""
growth_rows = conn.execute(f'''
    SELECT CAST(sister_uid AS TEXT) AS su,
           MAX({SCORE}) - MIN({SCORE}) AS gr,
           MAX(days_since_formed) AS days
    FROM team_detail
    WHERE sister_uid2 IS NOT NULL AND sister_uid2 != ''
    GROUP BY team_id
''').fetchall()

per_cap_g = {}
for r in growth_rows:
    g = per_cap_g.setdefault(r['su'], {'teams': 0, 'gr_sum': 0.0})
    gr = r['gr'] or 0
    days = r['days'] or 1
    if gr > 0:
        g['gr_sum'] += gr / days
    g['teams'] += 1

monthly = sorted(g['gr_sum'] / g['teams'] * 30 for g in per_cap_g.values() if g['teams'] > 0)
m = len(monthly)
def pctp(p):
    return round(monthly[min(m - 1, int(m * p))], 1) if m else 0

print()
print('═' * 56)
print('2. 妹妹成长分/月分布（按姐姐，难度加权）')
print('═' * 56)
print(f'姐姐数: {m}')
for p in (0.25, 0.5, 0.75, 0.9, 0.95, 0.99):
    print(f'  P{int(p*100)}: {pctp(p)} 分/月')
over30 = sum(1 for v in monthly if v > 30)
print(f'  当前 T=30 封顶影响: {over30} 人（{over30/m*100:.1f}%）超过 30 分/月')

conn.close()
print()
print('完成。请根据上述分布定稿阈值。')
