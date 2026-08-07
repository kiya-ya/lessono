import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'crawler'))

from crawler import SistersCrawler

crawler = SistersCrawler()

try:
    url = f'{crawler.BASE_URL}/sisters/tj'
    resp = crawler.session.get(url, timeout=30)
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(resp.text, 'html.parser')
    tables = soup.find_all('table')
    if tables:
        table = tables[0]
        rows = table.find_all('tr')
        # 打印表头
        header_row = rows[0]
        cols = header_row.find_all(['td', 'th'])
        headers = [c.get_text(strip=True) for c in cols]
        print(f'表头: {headers}')
        
        # 打印前10行数据（包括全部和具体大厅）
        print('\n前10行数据:')
        for i, row in enumerate(rows[1:11]):
            cols = row.find_all(['td', 'th'])
            cells = [c.get_text(strip=True) for c in cols]
            print(f'  Row {i+1}: {cells}')
    else:
        print('No tables found')
    
    # 保存 HTML
    with open('debug_stats_tj.html', 'w', encoding='utf-8') as f:
        f.write(resp.text)
    print('\nSaved to debug_stats_tj.html')
    
except Exception as e:
    print(f'Error: {e}')
    import traceback
    traceback.print_exc()
