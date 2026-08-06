"""
直接测试 app.py 中的 api_uid_query 逻辑（不通过HTTP），
验证 team_total_revenue 是否正确计算。
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 模拟 Flask request
class MockRequest:
    def __init__(self, body):
        self._body = body
    def get_json(self):
        return self._body

# 需要把 Flask 的 request 替换成 MockRequest
# 为了不启动 Flask，我们直接复制 api_uid_query 的核心逻辑来测试

from backend.app import _get_team_info_by_uid, _get_bound_sisters, _uid_crawler_available
from crawler.uid_crawler import UIDCrawler

test_uid = '14828704'
captain_type = 'game'

print(f'测试 UID: {test_uid}')
print(f'爬虫可用: {_uid_crawler_available}')

# 1. 查询本地姐妹团信息
team_info = _get_team_info_by_uid(test_uid, None)
print(f'\n本地姐妹团信息:')
print(f'  team_info: {team_info}')

# 2. 爬虫查询
try:
    crawler = UIDCrawler()
    result = crawler.query_with_compare(test_uid, captain_type)
    print(f'\n爬虫返回:')
    print(f'  uid: {result.get("uid")}')
    print(f'  nickname: {result.get("nickname")}')
    print(f'  this_week.data.total_revenue: {result.get("this_week",{}).get("data",{}).get("total_revenue")}')
except Exception as e:
    print(f'爬虫查询失败: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 3. 查询绑定的妹妹
bound_teams = _get_bound_sisters(test_uid)
print(f'\n绑定妹妹数量: {len(bound_teams)}')
for t in bound_teams:
    print(f'  妹妹UID: {t.get("sister_uid2")}, 昵称: {t.get("sister_nickname2")}')

# 4. 计算成团累计流水（复制 app.py 中的逻辑）
team_total_revenue = 0.0
if result.get('this_week', {}).get('data', {}).get('total_revenue'):
    team_total_revenue += float(result['this_week']['data']['total_revenue'])
    print(f'\n姐姐累计流水: {result["this_week"]["data"]["total_revenue"]}')

if bound_teams:
    for team in bound_teams:
        sister_uid = team.get('sister_uid2')
        if not sister_uid:
            continue
        try:
            c = UIDCrawler()
            sister_data = c.query_with_compare(str(sister_uid), captain_type)
            s_tr = sister_data.get('this_week', {}).get('data', {}).get('total_revenue')
            print(f'妹妹 {sister_uid} 累计流水: {s_tr}')
            if s_tr:
                team_total_revenue += float(s_tr)
        except Exception as e:
            print(f'查询妹妹 {sister_uid} 失败: {e}')

print(f'\n=== 成团累计流水: {round(team_total_revenue, 2)} ===')
