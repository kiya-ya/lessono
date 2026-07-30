import sys
import os
sys.path.insert(0, 'D:/姐妹团看板系统/crawler')

from crawler import _load_cookie, COOKIE_STR, SistersCrawler

cookie_from_file = _load_cookie()
print(f'[TEST] _load_cookie() 返回值长度: {len(cookie_from_file)}')
print(f'[TEST] _load_cookie() 前100字符: {cookie_from_file[:100]}...')
print(f'[TEST] 硬编码COOKIE_STR长度: {len(COOKIE_STR)}')
print(f'[TEST] 两者是否相同: {cookie_from_file == COOKIE_STR}')

# 创建爬虫实例，检查实际使用的Cookie
crawler = SistersCrawler()
actual_cookie = crawler.session.headers.get('Cookie', '')
print(f'[TEST] 爬虫实际使用Cookie长度: {len(actual_cookie)}')
print(f'[TEST] 爬虫Cookie是否来自文件: {actual_cookie == cookie_from_file}')
print(f'[TEST] 爬虫Cookie是否来自硬编码: {actual_cookie == COOKIE_STR}')
