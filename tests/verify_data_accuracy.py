#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""各模块数据准确性交叉验证：HTTP API 输出 vs 直接 SQL 独立重算
用法: .venv/Scripts/python.exe tests/verify_data_accuracy.py
前提: 后端运行在 127.0.0.1:5000
"""
import json
import sqlite3
import urllib.parse
import urllib.request
from datetime import datetime

BASE = 'http://127.0.0.1:5000'
COOKIE = 'auth_uid=34315471'  # admin
DB = 'data/stats.db'
POLICY_WEEK = '2026-07-20'

results = []

def check(name, api_val, db_val, tol=0.01):
    try:
        ok = abs(float(api_val) - float(db_val)) <= tol
    except (TypeError, ValueError):
        ok = api_val == db_val
    results.append((ok, name, api_val, db_val))
    return ok

def api(path, cookie=COOKIE):
    req = urllib.request.Request(BASE + path, headers={'Cookie': cookie})
    return json.load(urllib.request.urlopen(req, timeout=30))

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

WEEK = 'week=2026-08-03%7C2026-08-09'

# ── 1. /api/kpi（全部大厅） ──
kpi = api('/api/kpi?' + WEEK)['data']
row = conn.execute("SELECT * FROM weekly_report WHERE hall_name='all' AND week_start='2026-08-03'").fetchone()
check('KPI.新成团数', kpi['new_team']['value'], row['new_team_count'])
check('KPI.进行中', kpi['active_team']['value'], row['active_team_count_end'])
exp_ret = min(100, round((row['active_team_count_end'] - row['new_team_count']) / row['active_team_count_start'] * 100, 2))
check('KPI.留存率(公式重算)', kpi['retention']['value'], exp_ret)
check('KPI.解散率', kpi['dissolution']['value'], row['dissolution_rate'])
check('KPI.流水', kpi['revenue']['value'], round(row['total_reward'], 1))

# ── 2. /api/kpi 单厅回退（心动频率，本周无数据应回退到 08-03 周） ──
hall = '王者荣耀·心动频率'
r = api('/api/kpi?hall=' + urllib.parse.quote(hall) + '&' + WEEK)
check('KPI单厅回退.week', r.get('week'), '08-03~08-09')
row2 = conn.execute("SELECT * FROM weekly_report WHERE hall_name=? AND week_start='2026-08-03'", (hall,)).fetchone()
check('KPI单厅.留存率', r['data']['retention']['value'],
      min(100, round((row2['active_team_count_end'] - row2['new_team_count']) / row2['active_team_count_start'] * 100, 2)) if row2['active_team_count_start'] > 0 else 0)

# ── 3. /api/hall-overview（厅运营 31053950 视角） ──
ov = api('/api/hall-overview?weeks=7', cookie='auth_uid=31053950')
managed = {x['hall_name'] for x in conn.execute("SELECT hall_name FROM hall_managers WHERE uid='31053950'")}
with_data = {x['hall_name'] for x in conn.execute("SELECT DISTINCT hall_name FROM weekly_report")}
check('hall-overview.厅集合', set(d['hall_name'] for d in ov['data']), managed & with_data)

# ── 4. /api/survival ──
sv = api('/api/survival')
ref = conn.execute('SELECT MAX(snapshot_date) AS r FROM team_detail').fetchone()['r']
DEDUP = """rowid IN (SELECT MAX(rowid) FROM team_detail
           WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail) GROUP BY team_id)"""
rows = conn.execute(f"SELECT form_date, dissolve_date, days_since_formed FROM team_detail WHERE {DEDUP}").fetchall()
active_db = sum(1 for x in rows if not (x['dissolve_date'] or '').strip())
check('survival.进行中团数', sv['active_count'], active_db)
ref_d = datetime.strptime(ref, '%Y-%m-%d').date()
elig = surv = 0
for x in rows:
    fd = (x['form_date'] or '')[:10]
    if not fd:
        continue
    fd = datetime.strptime(fd, '%Y-%m-%d').date()
    if (ref_d - fd).days < 7:
        continue
    elig += 1
    dd = (x['dissolve_date'] or '')[:10]
    if not dd:
        surv += 1
    else:
        dd = datetime.strptime(dd, '%Y-%m-%d').date()
        if (dd - fd).days >= 7:
            surv += 1
check('survival.7日存活率', sv['survival']['d7']['rate'], round(surv / elig * 100, 1))
check('survival.7日样本数', sv['survival']['d7']['total'], elig)

# ── 5. /api/daily-events（逐日核对） ──
de = api('/api/daily-events?days=14')
check('daily-events.ref_date', de['ref_date'], ref)
for i, d in enumerate(de['dates']):
    new_db = conn.execute(f"SELECT COUNT(*) AS c FROM team_detail WHERE {DEDUP} AND substr(form_date,1,10)=?", (d,)).fetchone()['c']
    diss_db = conn.execute(f"SELECT COUNT(*) AS c FROM team_detail WHERE {DEDUP} AND substr(dissolve_date,1,10)=?", (d,)).fetchone()['c']
    check(f'daily-events.{d}.新成团', de['new_teams'][i], new_db)
    check(f'daily-events.{d}.解散', de['dissolved'][i], diss_db)

# ── 6. /api/policy-impact（全平台） ──
pi = api('/api/policy-impact')
def agg_db(direction):
    op, order = ('<', 'DESC') if direction == 'pre' else ('>=', 'ASC')
    return conn.execute(f"""SELECT AVG(retention_rate) ret, AVG(total_reward) rev FROM
        (SELECT retention_rate, total_reward FROM weekly_report WHERE hall_name='all' AND week_start {op} ?
         ORDER BY week_start {order} LIMIT 4)""", (POLICY_WEEK,)).fetchone()
pre, post = agg_db('pre'), agg_db('post')
check('policy.留存率前', pi['overall']['ret_pre'], round(pre['ret'], 1))
check('policy.留存率后', pi['overall']['ret_post'], round(post['ret'], 1))
check('policy.流水前', pi['overall']['rev_pre'], round(pre['rev'], 1))
check('policy.流水后', pi['overall']['rev_post'], round(post['rev'], 1))

# ── 7. /api/captains TOP1 ──
cp = api('/api/captains?limit=1')
top_db = conn.execute(f"""SELECT sister_uid, SUM(reward_amount) rev FROM team_detail
    WHERE {DEDUP} AND sister_uid != '' GROUP BY sister_uid ORDER BY rev DESC LIMIT 1""").fetchone()
check('captains.TOP1.uid', cp['data'][0]['uid'], top_db['sister_uid'])
check('captains.TOP1.流水', cp['data'][0]['total_reward'], round(top_db['rev'], 1))

conn.close()

# ── 汇总 ──
passed = sum(1 for x in results if x[0])
print(f'\n{"=" * 60}')
for ok, name, av, dv in results:
    print(f"{'PASS' if ok else 'FAIL'}  {name}  API={av}  DB={dv}")
print(f'{"=" * 60}')
print(f'共 {len(results)} 项检查，通过 {passed} 项' + ('，全部通过' if passed == len(results) else f'，失败 {len(results) - passed} 项'))
