"""测试爬虫是否能正确抓取 total_revenue"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from crawler.uid_crawler import UIDCrawler

# 用一个已知的 UID 测试
test_uid = "14828704"  # 之前用户查询过的 UID
crawler = UIDCrawler()

try:
    result = crawler.query_with_compare(test_uid, 'game')
    print("=== 爬虫返回结果 ===")
    print(f"uid: {result.get('uid')}")
    print(f"nickname: {result.get('nickname')}")
    
    this_data = result.get('this_week', {}).get('data', {})
    print(f"\n本周数据中的 total_revenue: {this_data.get('total_revenue')}")
    print(f"本周数据中的 week_revenue: {this_data.get('week_revenue')}")
    print(f"本周数据中的 keys: {list(this_data.keys())}")
    
    # 检查 compare 中的 total_revenue
    cmp = result.get('compare', {})
    print(f"\ncompare.total_revenue: {cmp.get('total_revenue')}")
    
    # 检查 bound_sisters
    bound = result.get('bound_sisters', [])
    print(f"\n绑定妹妹数量: {len(bound)}")
    for i, s in enumerate(bound):
        s_data = s.get('uid_data', {}).get('this_week', {}).get('data', {})
        print(f"  妹妹{i+1} total_revenue: {s_data.get('total_revenue')}")
        
except Exception as e:
    print(f"查询失败: {e}")
    import traceback
    traceback.print_exc()
