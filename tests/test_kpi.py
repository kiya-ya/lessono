import sys, json
sys.path.insert(0, 'backend')

# 模拟 Flask request context
class MockRequest:
    args = {}
    @classmethod
    def get(cls, key, default=''):
        return cls.args.get(key, default)

# 需要 patch request
from unittest.mock import patch
from app import api_kpi

with patch('app.request', MockRequest):
    resp = api_kpi()
    data = json.loads(resp.get_data())
    print('KPI Response:')
    for k, v in data['data'].items():
        print(f"  {k}: {v['value']} {v.get('unit', '')}")
    print(f"\nDate: {data.get('date')}, Week: {data.get('week')}")
