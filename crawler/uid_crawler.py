#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UID查询爬虫模块
数据源: http://server1.tuwan.com:10010/fly2013/play_user_newcaptian.php
功能: 通过UID查询个人维度数据，支持本周vs上周对比

使用说明:
  1. 需要先在内网登录 UID 查询系统，获取有效 Cookie
  2. 将 Cookie 粘贴到本文件顶部的 UID_COOKIE_STR 中
  3. 运行测试: python crawler/uid_crawler.py

【Cookie 更新位置】本文件第 44~66 行
"""
import os
import re
import json
import requests
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import urllib3

urllib3.disable_warnings()


# ═══════════════════════════════════════════════════════════════════════════
#  Cookie 配置 —— 从 data/cookie.json 读取，支持前端直接更新
# ═══════════════════════════════════════════════════════════════════════════

def _load_cookie_config() -> dict:
    """从 data/cookie.json 读取 Cookie 配置"""
    config_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'cookie.json')
    default_cookie = (
        'menuitems=1_1%2C2_1%2C3_1; '
        'tgid=8db46576-438d-4df9-94fb-919cc70ff394; '
        'Tuwan_Passport=70BA14BACF64FC23F3A195DE19D9EF3AAD839EC58630830C1198BBBC361716218CA1A115992E624D3A7BB080CFE18C73E0FDC2494FAA32E5AB6AEE78475D5043EA3EEC594645BF35AC727F4A18017107EC2EBE673D0631CAACE8EBC60EA8AF9830F656AD312DD30DB72FF28747763D574A514587530BDBE406B92314FE7F60E13D7A7CAE88E0B032; '
        'webclientmac=WAmlf122QxlmIVWieZjZiVD6IYo/rDgrDZIHiWyc7XafqccAZVJwFjFIDlCFtMFB; '
        'Hm_lvt_4f076a14812b9a06461d3e2748176769=1783853097,1783997507; '
        'HMACCOUNT=ED03E44156D99A6E; '
        'smdeviceid=BO6GXTt6RjOV/xwo5LWS2cDZl3VVl823f7uBOCksxpFfI6GBjcvVHnVT5raLz26lC7sAzGFgWiTv7SFGRM4s6FQ%3D%3D; '
        'Hm_lpvt_4f076a14812b9a06461d3e2748176769=1785149095; '
        'PHPSESSID=6al6eqs5odim6psgs60nj5b1j3; '
        'PHPSESSID__ckMd5=b313a5c2e8564922; '
        'dede_admin_id=1769; dede_admin_id__ckMd5=e355c583ca07db4e; '
        'dede_admin_type=6; dede_admin_type__ckMd5=ff89eded3d12173d; '
        'dede_admin_channel__ckMd5=fb36da997e13127b; '
        'dede_admin_name=%E5%BC%A0%E6%81%AC%E8%99%9E; dede_admin_name__ckMd5=f203203b8e4b326a; '
        'dede_admin_purview=t_AccList+t_AccNew+t_AccEdit+t_AccDel+a_List+a_New+a_Edit+a_Del+a_Commend+a_Check+a_AccNew+a_AccList+a_AccEdit+a_AccDel+a_AccCheck+a_MyList+a_MyEdit+a_MyDel+a_MyCheck+a_Recycling+sys_MdPwd+plus_%E7%BB%9F%E8%AE%A1+plus_%E7%82%B9%E7%82%B9%E5%BC%80%E9%BB%91+plus_%E5%AF%86%E7%A0%81%E4%BF%AE%E6%94%B9; '
        'dede_admin_purview__ckMd5=2aa325fe2b62bb18; '
        'dede_admin_style=newdedecms; dede_admin_style__ckMd5=ceda8b7d4c9be289; '
        'DedeUserID=1769; DedeUserID__ckMd5=e355c583ca07db4e; '
        'DedeLoginTime=1785208064; DedeLoginTime__ckMd5=6a8cc850cc9c2861'
    )
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
        return {
            'cookie_str': cfg.get('cookie_str', default_cookie),
            'basic_auth': cfg.get('basic_auth', 'MjAxODoyMDE4dHV3YW50ZW5nZmVp'),
            'updated_at': cfg.get('updated_at', ''),
        }
    except Exception as e:
        print(f'[WARN] 读取 cookie.json 失败: {e}，使用默认Cookie')
        return {
            'cookie_str': os.environ.get('UID_QUERY_COOKIE', default_cookie),
            'basic_auth': os.environ.get('UID_BASIC_AUTH', 'MjAxODoyMDE4dHV3YW50ZW5nZmVp'),
            'updated_at': '',
        }


_COOKIE_CFG = _load_cookie_config()
UID_COOKIE_STR = _COOKIE_CFG['cookie_str']
UID_BASIC_AUTH = _COOKIE_CFG['basic_auth']

UID_BASE_URL = 'http://server1.tuwan.com:10010'
UID_QUERY_URL = f'{UID_BASE_URL}/fly2013/play_user_newcaptian.php'

# 调试模式：设置环境变量 UID_DEBUG=1 时，把 UID 查询的响应 HTML 保存到 tests/ 目录
# 默认关闭，避免每次查询都在项目根目录生成 debug_uid_*.html 垃圾文件
UID_DEBUG = os.environ.get('UID_DEBUG') == '1'

# 类型分类映射 (前端key -> 表单type值)
CAPTAIN_TYPE_VALUES = {
    'game': '0',      # 新队长-游戏
    'karaoke': '1',   # 新队长-歌房
    'werewolf': '2',  # 新队长-狼人杀
    'live': '3',      # 实时-乐园杀
}

CAPTAIN_TYPE_LABELS = {
    'game': '新队长-游戏',
    'karaoke': '新队长-歌房',
    'werewolf': '新队长-狼人杀',
    'live': '实时-乐园杀',
}

# 兼容旧代码的别名 (backend/app.py 依赖此名称)
CAPTAIN_TYPES = CAPTAIN_TYPE_LABELS

# 字段名映射（HTML表头 → 内部字段名）
FIELD_MAP = {
    'UID': 'uid',
    '昵称': 'nickname',
    '排档所属大厅': 'schedule_hall',
    '权限所属大厅': 'auth_hall',
    '入厅时间': 'join_hall_time',
    '首次排档时间': 'first_schedule_time',
    '保护期结束时间': 'protection_end',
    '队长类型': 'captain_type',
    '最近一次离职时间': 'last_leave_time',
    '是否精英队长': 'is_elite',
    '当周队长等级': 'week_level',
    '当周排档天数': 'week_schedule_days',
    '累计排档天数': 'total_schedule_days',
    '当周总排档数': 'week_schedule_count',
    '每日任务完成次数': 'daily_task_count',
    '当周队长排行榜排名': 'week_rank',
    '当周陪档总时长': 'week_accompany_time',
    '周值班开车/唱歌数': 'week_drive_count',
    '周游戏时长要求': 'week_game_time_req',
    '周总开车数/唱歌打卡数': 'week_total_drive',
    '当周礼物总流水': 'week_revenue',
    '累计总流水': 'total_revenue',
    '4周最高等级': 'best_4week_level',
    '历史最高等级': 'hist_best_level',
    '上次回归时间': 'last_return_time',

    '外宣': 'promotion',
    '招新系统': 'recruitment',
    '上月是否连续7日排档': 'last_month_continuous7',
}


class CookieExpiredError(Exception):
    """Cookie已过期"""
    pass


class UIDCrawler:
    """UID查询爬虫"""

    def __init__(self):
        self.session = requests.Session()
        self.session.verify = False
        self._build_headers()

    def _build_headers(self):
        """构建请求头（每次实例化时重新读取 cookie.json，前端更新 Cookie 后立即生效，无需重启）"""
        cfg = _load_cookie_config()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.0',
            'Cookie': cfg['cookie_str'],
            'Referer': f'{UID_BASE_URL}/fly2013/play_user_newcaptian.php',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Authorization': f"Basic {cfg['basic_auth']}",
        })

    def query(self, uid: str, captain_type: str = 'game',
              date_start: str = None, date_end: str = None) -> dict:
        """
        查询单个UID在指定周期的数据

        请求方式:
          POST 到 play_user_newcaptian.php?dopost=selectuid
          参数: uid, type(数字), belongdate
        """
        # 默认本周
        if date_start is None or date_end is None:
            today = datetime.now()
            monday = today - timedelta(days=today.weekday())
            sunday = monday + timedelta(days=6)
            date_start = date_start or monday.strftime('%Y-%m-%d')
            date_end = date_end or sunday.strftime('%Y-%m-%d')

        belongdate = f'{date_start} - {date_end}'
        type_value = CAPTAIN_TYPE_VALUES.get(captain_type, '0')
        type_label = CAPTAIN_TYPE_LABELS.get(captain_type, '新队长-游戏')

        print(f'[UID-Crawl] 查询 UID={uid}, 类型={type_label}, 周期={belongdate}')

        try:
            # 方式1: POST 到 ?dopost=selectuid（multipart/form-data 模拟浏览器表单）
            url = f'{UID_QUERY_URL}?dopost=selectuid'
            # 使用 files 参数强制 multipart/form-data 格式（和浏览器表单一致）
            files = {
                'uids': ('', ''),        # 空文件字段，必须带filename=""（服务器强制检查）
                'uid': (None, uid),
                'type': (None, type_value),
                'belongdate': (None, belongdate),
                'search': (None, '搜索'),
            }

            resp = self.session.post(url, files=files, timeout=30)
            resp.raise_for_status()
            text = resp.text.strip()

            # 调试：保存HTML到文件（仅 UID_DEBUG=1 时，输出到 tests/ 目录）
            if UID_DEBUG:
                debug_file = os.path.join(os.path.dirname(__file__), '..', 'tests', f'debug_uid_{uid}.html')
                with open(debug_file, 'w', encoding='utf-8') as f:
                    f.write(text)
                print(f'[UID-Crawl] 响应已保存: {debug_file}')

            # 检查是否是登录页
            if '织梦内容管理系统' in text or 'login' in text.lower():
                raise CookieExpiredError(
                    'Cookie已过期，请重新登录UID查询系统并更新Cookie。\n'
                    '更新位置: 页面右上角「Cookie 管理」→ UID 查询 Cookie'
                )

            # 检查是否是错误消息
            if len(text) < 100:
                if '数据格式不正确' in text:
                    # fallback: 尝试不带 dopost 的方式
                    print('[UID-Crawl-WARN] dopost方式返回"数据格式不正确"，尝试fallback方式')
                    return self._query_fallback(uid, type_value, belongdate)
                raise Exception(f'服务器返回错误: {text}')

            # 解析HTML表格
            result = self._parse_html_table(text, uid)
            if result.get('found'):
                print(f'[UID-Crawl] 查询成功: UID={uid}, 昵称={result.get("nickname", "")}')
            else:
                print(f'[UID-Crawl] 未找到数据: UID={uid}, msg={result.get("msg", "")}')
            return result

        except CookieExpiredError:
            raise
        except requests.exceptions.ConnectionError as e:
            raise Exception(f'无法连接到UID查询服务器({UID_BASE_URL})，请确认内网VPN已连接: {e}')
        except Exception as e:
            print(f'[UID-Crawl-ERROR] 查询失败: {e}')
            raise

    def _query_fallback(self, uid: str, type_value: str, belongdate: str) -> dict:
        """Fallback: 不带dopost参数的请求方式（同样使用multipart）"""
        url = UID_QUERY_URL
        files = {
            'uids': ('', ''),        # 空文件字段，必须带filename=""（服务器强制检查）
            'uid': (None, uid),
            'type': (None, type_value),
            'belongdate': (None, belongdate),
            'search': (None, '搜索'),
        }
        resp = self.session.post(url, files=files, timeout=30)
        text = resp.text.strip()
        return self._parse_html_table(text, uid)

    def _parse_html_table(self, html: str, uid: str) -> dict:
        """
        解析UID查询返回的HTML，提取表格数据
        """
        soup = BeautifulSoup(html, 'html.parser')

        # 查找数据表格
        tables = soup.find_all('table')
        if not tables:
            return {'uid': uid, 'found': False, 'nickname': '', 'msg': '页面中没有表格'}

        # 遍历所有表格，找到包含数据行的
        for table in tables:
            rows = table.find_all('tr')
            if len(rows) < 2:
                continue

            # 定位表头行（第一列为UID的行，跳过包含<input>的表单行）
            headers = []
            header_row_idx = None
            for i, row in enumerate(rows):
                cells = row.find_all(['td', 'th'])
                texts = [c.get_text(strip=True) for c in cells]
                if texts and texts[0] == 'UID' and len(texts) > 10:
                    headers = texts
                    header_row_idx = i
                    break

            if not headers:
                continue

            # 查找匹配的数据行
            for row in rows[header_row_idx + 1:]:
                cells = row.find_all(['td', 'th'])
                texts = [c.get_text(strip=True) for c in cells]
                if not texts:
                    continue
                # 匹配UID（第一列）
                first_col = texts[0] if texts else ''
                if first_col == uid or first_col.replace(' ', '') == uid:
                    return self._map_data_row(texts, headers, uid)

            # 如果遍历完所有行都没找到匹配的UID，记录信息
            print(f'[UID-Crawl-DEBUG] 表格有 {len(rows)} 行，表头: {headers[:5]}...')
            if len(rows) > header_row_idx + 1:
                sample = rows[header_row_idx + 1]
                sample_texts = [c.get_text(strip=True) for c in sample.find_all(['td', 'th'])]
                print(f'[UID-Crawl-DEBUG] 第一行数据: {sample_texts[:5]}...')

        # 所有表格都没找到
        return {'uid': uid, 'found': False, 'nickname': '', 'msg': '表格中未找到该UID的数据'}

    def _map_data_row(self, data_row: list, headers: list, uid: str) -> dict:
        """将数据行映射到字段"""
        result = {'uid': uid, 'found': True}
        for i, header in enumerate(headers):
            if i >= len(data_row):
                break
            field = FIELD_MAP.get(header, header)
            value = data_row[i]

            # 数值转换
            if field in ['week_schedule_days', 'total_schedule_days', 'week_schedule_count',
                         'daily_task_count', 'week_rank', 'week_drive_count', 'week_total_drive']:
                try:
                    value = int(float(value)) if value else 0
                except:
                    value = 0
            elif field in ['week_revenue', 'total_revenue']:
                try:
                    # 去除可能的货币符号和逗号
                    clean = re.sub(r'[¥,元\s]', '', str(value)) if value else ''
                    value = float(clean) if clean else 0.0
                except:
                    value = 0.0
            elif field == 'week_accompany_time':
                # 服务端返回的是分钟数，直接保留
                try:
                    value = float(value) if value else 0.0
                except:
                    value = 0.0

            result[field] = value

        result['_query_time'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        return result

    def query_with_compare(self, uid: str, captain_type: str = 'game') -> dict:
        """
        查询UID并自动对比本周 vs 上周数据（并行请求，提速约一倍）
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed

        today = datetime.now()

        this_monday = today - timedelta(days=today.weekday())
        this_sunday = this_monday + timedelta(days=6)
        last_monday = this_monday - timedelta(days=7)
        last_sunday = this_sunday - timedelta(days=7)

        this_start = this_monday.strftime('%Y-%m-%d')
        this_end   = this_sunday.strftime('%Y-%m-%d')
        last_start = last_monday.strftime('%Y-%m-%d')
        last_end   = last_sunday.strftime('%Y-%m-%d')

        print(f'[UID-Crawl] 开始并行对比查询: 本周({this_start}~{this_end}) vs 上周({last_start}~{last_end})')

        # 并行请求本周 + 上周（各用独立 Crawler 实例，完全线程安全）
        def _query_week(start: str, end: str, label: str) -> tuple:
            print(f'[UID-Crawl] [{label}] 请求开始 {start}~{end}')
            c = UIDCrawler()  # 每个线程独立实例
            result = c.query(uid, captain_type, start, end)
            print(f'[UID-Crawl] [{label}] 请求完成 {start}~{end}, found={result.get("found")}')
            return label, result

        results = {}
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = {
                executor.submit(_query_week, this_start, this_end, 'this'): 'this',
                executor.submit(_query_week, last_start, last_end, 'last'):  'last',
            }
            for future in as_completed(futures):
                label, data = future.result()
                results[label] = data

        this_data = results['this']
        last_data = results['last']

        compare = self._build_compare(this_data, last_data)

        return {
            'uid': uid,
            'nickname': this_data.get('nickname', last_data.get('nickname', '')),
            'captain_type': captain_type,
            'type_label': CAPTAIN_TYPE_LABELS.get(captain_type, '新队长-游戏'),
            'this_week': {
                'period': f'{this_start} ~ {this_end}',
                'week_label': self._get_week_label(this_monday),
                'data': this_data,
            },
            'last_week': {
                'period': f'{last_start} ~ {last_end}',
                'week_label': self._get_week_label(last_monday),
                'data': last_data,
            },
            'compare': compare,
        }

    def _get_week_label(self, date: datetime) -> str:
        """根据日期获取周标签 (MM-DD ~ MM-DD)"""
        monday = date - timedelta(days=date.weekday())
        sunday = monday + timedelta(days=6)
        return f'{monday.strftime("%m-%d")} ~ {sunday.strftime("%m-%d")}'

    def _build_compare(self, this: dict, last: dict) -> dict:
        """构建本周vs上周对比数据"""
        compare = {}
        level_order = {'无': 0, '铜牌': 1, '银牌': 2, '金牌': 3, '王牌': 4, '大神': 5}

        # 1. 队长等级
        this_level = this.get('week_level', '')
        last_level = last.get('week_level', '')
        this_lv = level_order.get(this_level, -1)
        last_lv = level_order.get(last_level, -1)
        if this_lv > last_lv:
            compare['week_level'] = {'this': this_level, 'last': last_level, 'change': f'↑晋升{this_lv - last_lv}级', 'trend': 'up'}
        elif this_lv < last_lv:
            compare['week_level'] = {'this': this_level, 'last': last_level, 'change': f'↓降级{last_lv - this_lv}级', 'trend': 'down'}
        else:
            compare['week_level'] = {'this': this_level, 'last': last_level, 'change': '—', 'trend': 'flat'}

        # 2. 排档天数
        compare['week_schedule_days'] = self._compare_numeric(
            this.get('week_schedule_days', 0), last.get('week_schedule_days', 0), '天')

        # 3. 每日任务
        compare['daily_task_count'] = self._compare_numeric(
            this.get('daily_task_count', 0), last.get('daily_task_count', 0), '次')

        # 4. 礼物流水
        compare['week_revenue'] = self._compare_numeric(
            this.get('week_revenue', 0), last.get('week_revenue', 0), '元')

        # 5. 陪档时长
        compare['week_accompany_time'] = self._compare_numeric(
            this.get('week_accompany_time', 0), last.get('week_accompany_time', 0), '分钟')

        # 6. 排名（越小越好）
        this_rank = this.get('week_rank', 0)
        last_rank = last.get('week_rank', 0)
        if this_rank and last_rank:
            rank_change = last_rank - this_rank
            if rank_change > 0:
                compare['week_rank'] = {'this': f'第{this_rank}名', 'last': f'第{last_rank}名', 'change': f'↑{rank_change}名', 'trend': 'up'}
            elif rank_change < 0:
                compare['week_rank'] = {'this': f'第{this_rank}名', 'last': f'第{last_rank}名', 'change': f'↓{abs(rank_change)}名', 'trend': 'down'}
            else:
                compare['week_rank'] = {'this': f'第{this_rank}名', 'last': f'第{last_rank}名', 'change': '—', 'trend': 'flat'}
        else:
            compare['week_rank'] = {'this': f'第{this_rank}名' if this_rank else '未上榜', 'last': f'第{last_rank}名' if last_rank else '未上榜', 'change': '—', 'trend': 'flat'}

        # 7. 累计流水
        compare['total_revenue'] = {
            'this': this.get('total_revenue', 0), 'last': last.get('total_revenue', 0),
            'change': '累计值', 'trend': 'flat'}

        # 9. 4周最高等级
        best4_this = this.get('best_4week_level', '')
        best4_last = last.get('best_4week_level', '')
        this_b4 = level_order.get(best4_this, -1)
        last_b4 = level_order.get(best4_last, -1)
        if this_b4 > last_b4:
            compare['best_4week_level'] = {'this': best4_this, 'last': best4_last, 'change': '↑晋升', 'trend': 'up'}
        elif this_b4 < last_b4:
            compare['best_4week_level'] = {'this': best4_this, 'last': best4_last, 'change': '↓降级', 'trend': 'down'}
        else:
            compare['best_4week_level'] = {'this': best4_this, 'last': best4_last, 'change': '—', 'trend': 'flat'}

        # 10. 所属大厅
        this_hall = this.get('schedule_hall', '') or this.get('auth_hall', '')
        last_hall = last.get('schedule_hall', '') or last.get('auth_hall', '')
        compare['hall'] = {'this': this_hall, 'last': last_hall, 'change': '—' if this_hall == last_hall else '有变动', 'trend': 'flat' if this_hall == last_hall else 'neutral'}

        # 11. 精英队长
        compare['is_elite'] = {'this': this.get('is_elite', '否'), 'last': last.get('is_elite', '否'), 'change': '—', 'trend': 'flat'}

        return compare

    def _compare_numeric(self, this_val, last_val, unit: str) -> dict:
        """对比数值型指标"""
        try:
            this_v = float(this_val) if this_val else 0
            last_v = float(last_val) if last_val else 0
        except:
            this_v = last_v = 0

        diff = this_v - last_v
        pct = (diff / last_v) * 100 if last_v > 0 else (100 if this_v > 0 else 0)

        if diff > 0:
            arrow, trend = '↑', 'up'
        elif diff < 0:
            arrow, trend = '↓', 'down'
        else:
            arrow, trend = '→', 'flat'

        return {'this': this_v, 'last': last_v, 'change': f'{arrow}{abs(diff):.1f}{unit}', 'change_pct': round(pct, 1), 'trend': trend}


# ═══════════════════════════════════════════════════════════════════════════
#  Mock 数据模式（用于前端开发测试，无需内网连接）
# ═══════════════════════════════════════════════════════════════════════════

def get_mock_uid_data(uid: str, captain_type: str = 'game') -> dict:
    """返回模拟的UID查询对比数据，用于前端开发测试"""
    return {
        'uid': uid,
        'nickname': '尾戒ᩚಣ',
        'captain_type': captain_type,
        'type_label': CAPTAIN_TYPE_LABELS.get(captain_type, '新队长-游戏'),
        'this_week': {
            'period': '2026-07-21 ~ 2026-07-27',
            'week_label': '07-21 ~ 07-27',
            'data': {
                'uid': uid, 'nickname': '尾戒ᩚਣ', 'found': True,
                'schedule_hall': '♡LOL战争女神厅♡',
                'auth_hall': '♡LOL战争女神厅♡',
                'captain_type': '新队长-游戏',
                'is_elite': '是',
                'week_level': '金牌',
                'week_schedule_days': 5,
                'total_schedule_days': 45,
                'week_schedule_count': 25,
                'daily_task_count': 12,
                'week_rank': 15,
                'week_accompany_time': 510,
                'week_drive_count': 10,
                'week_total_drive': 12,
                'week_revenue': 1280.0,
                'total_revenue': 12500.0,
                'best_4week_level': '金牌',
                'hist_best_level': '金牌',
                'protection_end': '2026-08-01',
            },
        },
        'last_week': {
            'period': '2026-07-14 ~ 2026-07-20',
            'week_label': '07-14 ~ 07-20',
            'data': {
                'uid': uid, 'nickname': '尾戒ᩚਣ', 'found': True,
                'schedule_hall': '♡LOL战争女神厅♡',
                'auth_hall': '♡LOL战争女神厅♡',
                'captain_type': '新队长-游戏',
                'is_elite': '是',
                'week_level': '银牌',
                'week_schedule_days': 3,
                'total_schedule_days': 40,
                'week_schedule_count': 18,
                'daily_task_count': 7,
                'week_rank': 42,
                'week_accompany_time': 312,
                'week_drive_count': 6,
                'week_total_drive': 8,
                'week_revenue': 850.0,
                'total_revenue': 11220.0,
                'best_4week_level': '银牌',
                'hist_best_level': '金牌',
                'protection_end': '2026-08-01',
            },
        },
        'compare': {
            'week_level': {'this': '金牌', 'last': '银牌', 'change': '↑晋升1级', 'trend': 'up'},
            'week_schedule_days': {'this': 5, 'last': 3, 'change': '↑2.0天', 'change_pct': 66.7, 'trend': 'up'},
            'daily_task_count': {'this': 12, 'last': 7, 'change': '↑5.0次', 'change_pct': 71.4, 'trend': 'up'},
            'week_revenue': {'this': 1280.0, 'last': 850.0, 'change': '↑430.0元', 'change_pct': 50.6, 'trend': 'up'},
            'week_accompany_time': {'this': 8.5, 'last': 5.2, 'change': '↑198.0分钟', 'change_pct': 63.5, 'trend': 'up'},
            'week_rank': {'this': '第15名', 'last': '第42名', 'change': '↑27名', 'trend': 'up'},
            'total_revenue': {'this': 12500.0, 'last': 11220.0, 'change': '累计值', 'trend': 'flat'},
            'best_4week_level': {'this': '金牌', 'last': '银牌', 'change': '↑晋升', 'trend': 'up'},
            'hall': {'this': '♡LOL战争女神厅♡', 'last': '♡LOL战争女神厅♡', 'change': '—', 'trend': 'flat'},
            'is_elite': {'this': '是', 'last': '是', 'change': '—', 'trend': 'flat'},
        },
        'team_info': {
            'team_id': 12345,
            'hall_name': '♡LOL战争女神厅♡',
            'form_date': '2026-03-15',
            'sister_nickname': '尾戒ᩚਣ',
            'sister_uid': uid,
            'sister_nickname2': '妹妹测试',
            'sister_uid2': '23073267',
            'total_revenue': 12500.0,
            'reward_amount': 3750.0,
            'status': '进行中',
            'dissolve_date': None,
        },
    }


if __name__ == '__main__':
    print('=' * 60)
    print('UID查询爬虫测试')
    print('=' * 60)

    print('\n[测试1] Mock数据模式')
    mock = get_mock_uid_data('26482359', 'game')
    print(f"UID: {mock['uid']}, 昵称: {mock['nickname']}")
    print(f"本周等级: {mock['compare']['week_level']['this']} (上周: {mock['compare']['week_level']['last']})")
    print(f"流水变化: {mock['compare']['week_revenue']['change']} ({mock['compare']['week_revenue']['change_pct']}%)")

    print('\n[测试2] 真实查询模式')
    print('提示: 以下测试需要内网连接和有效Cookie')
    try:
        crawler = UIDCrawler()
        result = crawler.query_with_compare('26482359', 'game')
        print(f"查询成功: {result['nickname']}")
        print(f"本周等级: {result['compare']['week_level']['this']}")
    except CookieExpiredError as e:
        print(f'Cookie已过期: {e}')
    except Exception as e:
        print(f'真实查询失败: {e}')

    print('\n' + '=' * 60)
