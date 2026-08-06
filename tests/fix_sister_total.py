path = r"D:\姐妹团看板系统\backend\app.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = """    # 计算成团累计流水 = 姐姐累计 + 所有绑定妹妹累计（数据来源 server1.tuwan.com:10010）
    team_total_revenue = 0.0
    if result.get('this_week', {}).get('data', {}).get('total_revenue'):
        team_total_revenue += float(result['this_week']['data']['total_revenue'])

    if result.get('bound_sisters'):
        for sister in result['bound_sisters']:
            sister_uid_data = sister.get('uid_data', {})
            if sister_uid_data and sister_uid_data.get('this_week', {}).get('data', {}).get('total_revenue'):
                team_total_revenue += float(sister_uid_data['this_week']['data']['total_revenue'])

    result['team_total_revenue'] = round(team_total_revenue, 2)"""

new = """    # 计算成团累计流水 = 姐姐累计 + 所有绑定妹妹累计（数据来源 server1.tuwan.com:10010）
    team_total_revenue = 0.0
    crawled_uids = set()

    # 1. 当前查询UID的累计流水
    if result.get('this_week', {}).get('data', {}).get('total_revenue'):
        team_total_revenue += float(result['this_week']['data']['total_revenue'])
        crawled_uids.add(uid)

    # 2. 绑定妹妹的累计流水（当前UID是姐姐的情况）
    if result.get('bound_sisters'):
        for sister in result['bound_sisters']:
            s_uid = str(sister.get('uid', ''))
            if s_uid in crawled_uids:
                continue
            crawled_uids.add(s_uid)
            sister_uid_data = sister.get('uid_data', {})
            if sister_uid_data and sister_uid_data.get('this_week', {}).get('data', {}).get('total_revenue'):
                team_total_revenue += float(sister_uid_data['this_week']['data']['total_revenue'])

    # 3. 如果当前UID是妹妹，额外查询姐姐的累计流水
    if team_info and str(team_info.get('sister_uid2')) == uid:
        captain_uid = team_info.get('sister_uid')
        if captain_uid and str(captain_uid) not in crawled_uids and _uid_crawler_available and not use_mock:
            try:
                c = UIDCrawler()
                captain_data = c.query_with_compare(str(captain_uid), captain_type)
                if captain_data.get('this_week', {}).get('data', {}).get('total_revenue'):
                    team_total_revenue += float(captain_data['this_week']['data']['total_revenue'])
                    print(f'[UID-API] 妹妹视角: 追加姐姐UID {captain_uid} 累计流水')
            except Exception as e:
                print(f'[WARN] 查询姐姐UID {captain_uid} 失败: {e}')

    result['team_total_revenue'] = round(team_total_revenue, 2)"""

if old not in content:
    print("old not found")
else:
    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("app.py updated")
