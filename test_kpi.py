import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
from app import app

client = app.test_client()
r = client.get('/api/kpi')
data = r.get_json()
if 'data' in data:
    kpi = data['data']
    print('retention value:', kpi['retention']['value'])
    print('retention <= 100:', kpi['retention']['value'] <= 100)
else:
    print('Error:', data)
