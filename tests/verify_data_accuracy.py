#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""接口冒烟回归（2026-09-15 重写）：检查当前正式版各接口的语义不变量
（旧版校验 weekly_report 表 + 固定周 + 逐字段 SQL 重算，口径早已废弃。重写为
「接口可访问 + 结构/取值域合法 + 关键口径自洽」的冒烟检查，不随口径迭代而过期）。

用法: .venv/Scripts/python.exe -X utf8 tests/verify_data_accuracy.py
前提: 后端运行在 127.0.0.1:5000
"""
import json
import sys
import urllib.request

BASE = 'http://127.0.0.1:5000'
COOKIE = 'auth_uid=34315471'  # admin 白名单

results = []


def check(name, ok, note=''):
    results.append((bool(ok), name, note))
    return ok


def api(path):
    req = urllib.request.Request(BASE + path, headers={'Cookie': COOKIE})
    return json.load(urllib.request.urlopen(req, timeout=60))


def main():
    # ── 1. KPI：周/月两种周期 + 字段完整 ──
    kpi_w = api('/api/kpi?hall=all')
    check('KPI.周.period_type', kpi_w.get('period_type') == 'week')
    check('KPI.周.字段完整', all(k in kpi_w['data'] for k in ('retention', 'dissolution', 'sister_retention', 'new_team')))
    check('KPI.妹妹留存率取值域', 0 <= (kpi_w['data']['sister_retention']['value'] or 0) <= 100)
    kpi_m = api('/api/kpi?hall=all&week=2026-08-01%7C2026-08-31')
    check('KPI.月.period_type', kpi_m.get('period_type') == 'month')
    check('KPI.月.月视图留存率非负', (kpi_m['data']['retention']['value'] or 0) >= 0,
          f"got {kpi_m['data']['retention']['value']}")

    # ── 2. 明细表：保护期列 + 方框数据源字段 ──
    dt = api('/api/detail-table?page=1&per_page=3')
    check('明细表.total>0', dt.get('total', 0) > 0)
    r0 = (dt.get('data') or [{}])[0]
    check('明细表.保护期字段存在', 'protection_end' in r0)
    check('明细表.方框字段存在', 'days_since_formed' in r0 and 'form_date' in r0)

    # ── 3. 毕业妹妹留存：排档主口径 + 产出质量口径 + 位图结构 ──
    gr = api('/api/grad-retention')['stats']
    check('毕业留存.total>0', gr.get('total', 0) > 0)
    check('毕业留存.排档率取值域', gr.get('w1s_rate') is None or 0 <= gr['w1s_rate'] <= 100)
    check('毕业留存.产出率取值域', gr.get('w1_rate') is None or 0 <= gr['w1_rate'] <= 100)
    g0 = gr['list'][0]
    check('毕业留存.位图结构', isinstance(g0.get('weeks_scheduled'), list) and len(g0['weeks_scheduled']) == 4)
    check('毕业留存.配对姐姐UID', bool(g0.get('sister_uid')))

    # ── 4. 传承链：师门榜排序 + 树结构 + 师承链 ──
    lr = api('/api/lineage-rank?limit=10')['data']
    check('师门榜.非空', len(lr) > 0)
    check('师门榜.排序正确', all(
        (-lr[i]['promoted_count'], -lr[i]['grad_count']) <= (-lr[i + 1]['promoted_count'], -lr[i + 1]['grad_count'])
        for i in range(len(lr) - 1)))
    promoted_uid = next((x['uid'] for x in lr if x['promoted_count'] > 0), None)
    if promoted_uid:
        lt = api('/api/lineage-tree?uid=' + promoted_uid)
        check('传承链.树有子代', len(lt['tree'].get('children', [])) > 0)
        check('传承链.ancestry 是数组', isinstance(lt.get('ancestry'), list))

    # ── 5. 解散原因两级钻取：大类合计 = 总数 ──
    dr = api('/api/dissolve-reasons')
    check('解散原因.大类合计=总数', sum(b['count'] for b in dr['buckets']) == dr['total'],
          f"{sum(b['count'] for b in dr['buckets'])} != {dr['total']}")
    check('解散原因.大类非空', len(dr['buckets']) > 0)

    # ── 6. 预警中心：含毕业妹妹留存卡且取值域合法 ──
    wc = api('/api/warncenter')
    keys = [c['key'] for c in wc['cards']]
    check('预警.含毕业妹妹留存卡', 'grad_ret' in keys, f'cards={keys}')
    grc = next(c for c in wc['cards'] if c['key'] == 'grad_ret')
    check('预警.毕业留存取值域', grc['current'] is None or 0 <= grc['current'] <= 100)

    # ── 7. 个人周趋势（毕业追踪） ──
    grad_uid = gr['list'][0]['sister_uid2']  # 毕业妹妹（member_weekly 的追踪对象）
    mw = api('/api/member-weekly?uid=' + grad_uid)
    check('个人周趋势.有周数据', len(mw.get('weeks', [])) > 0)
    if mw.get('weeks'):
        w0 = mw['weeks'][0]
        check('个人周趋势.字段完整', all(k in w0 for k in ('week', 'revenue', 'schedule_days')))

    # ── 8. 生命周期方框：4 周 + 状态合法 ──
    tid = r0.get('team_id')
    if tid:
        lw = api(f'/api/team/{tid}/life-weeks')
        check('方框.4周', len(lw.get('weeks', [])) == 4)
        states = {w['state'] for w in lw.get('weeks', [])}
        check('方框.状态合法', states <= {'done', 'current', 'future', 'gone', 'dissolved'}, f'states={states}')

    # ── 汇总 ──
    passed = sum(1 for r in results if r[0])
    print()
    for ok, name, note in results:
        print(('PASS' if ok else 'FAIL') + f'  {name}' + (f'  ({note})' if note and not ok else ''))
    print(f'\n{passed}/{len(results)} PASS')
    sys.exit(0 if passed == len(results) else 1)


if __name__ == '__main__':
    main()
