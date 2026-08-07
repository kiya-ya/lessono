import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'crawler'))

from crawler import SistersCrawler

crawler = SistersCrawler()

# 只抓取 stats 页面，打印表头
try:
    url = f'{crawler.BASE_URL}/sisters/tj'
    resp = crawler.session.get(url, timeout=30)
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(resp.text, 'html.parser')
    tables = soup.find_all('table')
    if tables:
        table = tables[0]
        rows = table.find_all('tr')
        for i, row in enumerate(rows[:3]):  # 只打印前3行
            cols = row.find_all(['td', 'th'])
            cells = [c.get_text(strip=True) for c in cols]
            print(f'Row {i}: {cells}')
    else:
        print('No tables found')
        
    # 保存 HTML 用于调试
    with open('debug_bigdata_tj.html', 'w', encoding='utf-8') as f:
        f.write(resp.text)
    print('Saved to debug_bigdata_tj.html')
    
except Exception as e:
    print(f'Error: {e}')
