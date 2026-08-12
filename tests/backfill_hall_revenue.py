#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性回填：抓取各厅近29天的厅总流水（厅详情页），写入 hall_revenue_daily
用法: .venv/Scripts/python.exe tests/backfill_hall_revenue.py
"""
import os
import sys
import time

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, 'crawler'))

import requests
from bs4 import BeautifulSoup
from crawler import SistersCrawler


def main():
    crawler = SistersCrawler()

    # 1. 从大厅主题页（最新一天）拿 厅ID ↔ 厅名称 映射
    daily = crawler.crawl_hall_daily_revenue()
    crawler.save_hall_daily_revenue(daily)  # 顺便入库当天数据
    hall_map = {d['hall_id']: d['hall_name'] for d in daily}
    print(f'共 {len(hall_map)} 个厅，开始逐厅回填历史日流水...')

    ok = fail = 0
    for i, (hall_id, hall_name) in enumerate(hall_map.items(), 1):
        url = f'{SistersCrawler.BASE_URL}/roomnew/index/4/1/all/all/{hall_id}'
        try:
            resp = crawler.session.get(url, timeout=60)
            soup = BeautifulSoup(resp.text, 'html.parser')
            tables = soup.find_all('table')
            if not tables:
                raise Exception('无数据表')
            table = tables[0]
            rows = table.find_all('tr')
            headers = [c.get_text(strip=True) for c in rows[0].find_all(['td', 'th'])]
            col = {name: idx for idx, name in enumerate(headers)}
            data = []
            for row in rows[1:]:
                cells = [c.get_text(strip=True) for c in row.find_all('td')]
                if len(cells) < len(headers):
                    continue
                try:
                    revenue = float(cells[col['厅总流水']].replace(',', '') or 0)
                except (ValueError, KeyError):
                    revenue = 0.0
                data.append({
                    'date': cells[col['日期']],
                    'hall_id': cells[col['大厅ID']],
                    'hall_name': cells[col['大厅名称']],
                    'hall_revenue': revenue,
                })
            crawler.save_hall_daily_revenue(data)
            ok += 1
            print(f'  [{i}/{len(hall_map)}] {hall_name}: {len(data)} 天')
        except Exception as e:
            fail += 1
            print(f'  [{i}/{len(hall_map)}] {hall_name} ({hall_id}): 失败 {e}')
        time.sleep(0.3)

    print(f'\n回填完成: 成功 {ok} 个厅, 失败 {fail} 个')


if __name__ == '__main__':
    main()
