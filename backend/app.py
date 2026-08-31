#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Flask后端API"""
import os
import sys
import sqlite3
import json
import random
import string
import base64
import io
from datetime import datetime, timedelta

from flask import Flask, jsonify, request, send_from_directory, Response, session
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont

# Windows 控制台默认 GBK 编码，打印含 emoji/特殊符号的昵称（如 ❍）会抛
# UnicodeEncodeError，导致 UID 查询等接口 500。改为容错模式，无法编码的字符替换输出。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors='replace')
    except Exception:
        pass

# 将crawler目录加入路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'crawler'))
from db import get_db

# UID查询模块（可选，内网环境才可用）
_uid_crawler_available = False
try:
    from uid_crawler import UIDCrawler, CAPTAIN_TYPES
    _uid_crawler_available = True
except Exception as e:
    print(f'[WARN] UID爬虫模块加载失败: {e}')
    from uid_crawler import CAPTAIN_TYPES

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'sisters-dashboard-secret-key-2026')
app.config['SESSION_TYPE'] = 'filesystem'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=10)
CORS(app, supports_credentials=True)

# 使用 Flask session
from functools import wraps

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user_uid = request.cookies.get('auth_uid')
        if not user_uid:
            return jsonify({'error': '未登录', 'login_url': '/login.html'}), 401
        return f(*args, **kwargs)
    return decorated

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, 'data', 'stats.db')


def init_auth_db():
    """启动时自动创建 users 表并插入白名单 UID（支持 Docker 首次启动）"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                uid TEXT PRIMARY KEY,
                nickname TEXT,
                role TEXT DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('''
            INSERT OR IGNORE INTO users (uid, nickname, role) VALUES (?, ?, ?)
        ''', ('34315471', '管理员', 'admin'))

        # users 表补充 hall_name 列（管理的厅名，从 hall_managers 同步，便于直接查看）
        try:
            conn.execute('ALTER TABLE users ADD COLUMN hall_name TEXT')
        except Exception:
            pass  # 列已存在
        try:
            conn.execute('''
                UPDATE users SET hall_name = (
                    SELECT GROUP_CONCAT(hm.hall_name, '、') FROM hall_managers hm WHERE hm.uid = users.uid
                )
            ''')
        except Exception:
            pass  # hall_managers 表尚未创建时跳过
        # 中文身份视图：直接浏览数据库时只看 UID / 管理的厅名 / 身份
        conn.execute('''
            CREATE VIEW IF NOT EXISTS users_simple AS
            SELECT uid AS 'UID',
                   COALESCE(hall_name, '—') AS '管理的厅名',
                   CASE WHEN role = 'admin' THEN '管理员' ELSE '运营' END AS '身份'
            FROM users
        ''')
        conn.commit()
        conn.close()
        print('[BOOT] 用户认证表初始化完成')
    except Exception as e:
        print(f'[WARN] 用户认证表初始化失败: {e}')


def init_talent_db():
    """创建培养力结果记录表（候选池阶段 B：记录「输送妹妹/提拔管理」动作及其结果）"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS talent_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sister_uid TEXT NOT NULL,
                sister_nickname TEXT,
                hall_name TEXT,
                action_type TEXT NOT NULL,
                action_date TEXT NOT NULL,
                note TEXT,
                result_sister_promoted INTEGER,
                result_team_alive INTEGER,
                result_revenue_up INTEGER,
                result_status TEXT DEFAULT 'pending',
                result_note TEXT,
                result_date TEXT,
                result_updated_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        # 兼容旧表：结果字段可能尚未创建，逐列补齐（列已存在则跳过）
        for _col, _ddl in (
            ('result_sister_promoted', 'INTEGER'),
            ('result_team_alive', 'INTEGER'),
            ('result_revenue_up', 'INTEGER'),
            ('result_status', "TEXT DEFAULT 'pending'"),
            ('result_note', 'TEXT'),
            ('result_date', 'TEXT'),
            ('result_updated_at', 'TIMESTAMP'),
        ):
            try:
                conn.execute(f'ALTER TABLE talent_actions ADD COLUMN {_col} {_ddl}')
            except Exception:
                pass  # 列已存在
        conn.commit()
        conn.close()
        print('[BOOT] 培养力结果记录表初始化完成')
    except Exception as e:
        print(f'[WARN] 培养力结果记录表初始化失败: {e}')


def init_detail_indexes():
    """为 team_detail 高频过滤列补索引（form_date/dissolve_date/hall_name），
    加速周指标重算与明细查询；幂等，已有索引跳过。"""
    try:
        conn = sqlite3.connect(DB_PATH)
        for ddl in (
            'CREATE INDEX IF NOT EXISTS idx_detail_form ON team_detail(form_date)',
            'CREATE INDEX IF NOT EXISTS idx_detail_dissolve ON team_detail(dissolve_date)',
            'CREATE INDEX IF NOT EXISTS idx_detail_hall ON team_detail(hall_name)',
        ):
            conn.execute(ddl)
        conn.commit()
        conn.close()
        print('[BOOT] team_detail 索引补齐完成')
    except Exception as e:
        print(f'[WARN] team_detail 索引补齐失败: {e}')


# 启动时执行
init_auth_db()
init_talent_db()
init_detail_indexes()


# Cookie 保活：启动 60 秒后先跑一次，之后每 30 分钟保活一次（防 session 因不活跃过期）
def _start_keepalive():
    import threading
    import time

    def loop():
        time.sleep(60)
        while True:
            try:
                from cookie_keepalive import run_keepalive
                run_keepalive()
            except Exception as e:
                print(f'[Keepalive] 运行失败: {e}')
            time.sleep(1800)

    threading.Thread(target=loop, daemon=True).start()


_start_keepalive()


def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d


def get_db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = dict_factory
    return conn


# 解散原因归一化（供「解散原因分布」「趋势结论层」复用）
DISSOLVE_REASON_CASE = """
    CASE
      WHEN dissolve_reason LIKE '%手动%' THEN '手动解散'
      WHEN dissolve_reason LIKE '%未完成%' THEN '任务未完成自动解散'
      WHEN dissolve_reason LIKE '%违规%' THEN '生态违规'
      WHEN dissolve_reason LIKE '%铜牌%' THEN '等级低于铜牌'
      WHEN dissolve_reason LIKE '%毕业%' THEN '毕业'
      WHEN dissolve_reason LIKE '%注销%' THEN '注销'
      WHEN dissolve_reason LIKE '%离职%' OR dissolve_reason LIKE '%不在同一个大厅%' THEN '离职'
      ELSE '其他'
    END
"""

# 姐妹团等级 → 数字秩（中文等级名不能按字典序 MAX，需映射后取最大秩）
LEVEL_NAMES = {7: '大神', 6: '王牌', 5: '金牌', 4: '银牌', 3: '初级银牌', 2: '铜牌', 1: '初级铜牌', 0: '无'}


def _level_rank_sql(col):
    return (f"CASE {col} WHEN '大神' THEN 7 WHEN '王牌' THEN 6 WHEN '金牌' THEN 5 "
            f"WHEN '银牌' THEN 4 WHEN '初级银牌' THEN 3 WHEN '铜牌' THEN 2 "
            f"WHEN '初级铜牌' THEN 1 ELSE 0 END")


def _level_score_sql(col):
    """等级成长分（难度加权，指数 2^(秩-1)），仅用于「妹妹成长」的 Δscore 计算。
    姐妹团从铜牌→王牌的升级难度非线性：每升一级难度约翻倍，故分值按指数而非等差，
    避免「铜牌→银牌」和「王牌→大神」被当成等量成长。
    分值表：大神 64 / 王牌 32 / 金牌 16 / 银牌 8 / 初级银牌 4 / 铜牌 2 / 初级铜牌 1 / 无 0。
    排序/展示/门槛仍用 _level_rank_sql 的线性秩，二者不混用。"""
    return (f"CASE {col} WHEN '大神' THEN 64 WHEN '王牌' THEN 32 WHEN '金牌' THEN 16 "
            f"WHEN '银牌' THEN 8 WHEN '初级银牌' THEN 4 WHEN '铜牌' THEN 2 "
            f"WHEN '初级铜牌' THEN 1 ELSE 0 END")


# ========== 指标重算（口径定稿 2026-08-17）==========
# 真值源 = team_detail 明细快照重算；stats_daily 仅保留「官方发放奖励」与成就。
# 留存率 = (期末进行中 − 本周新成团) ÷ 期初进行中（老团留存）
# 解散率 = 非毕业解散 ÷ 期初进行中；毕业（满30天）不算流失。
# 主动解散占比 = 主动解散 ÷ 非毕业解散。
# 周 = 周一 → 周日（ws/we 为日历周界）。
# 期初/期末 = 该周 [ws, we] 内最早/最晚的 snapshot_date（首个/末个有快照的日期）。
#   快照按日抓取（team_detail 每日一版）；若周一/周日缺快照（如节假日、断更），
#   则期初/期末自动退到该周内最近一次快照，而非强行取周一/周日。
#   期初进行中 = 期初快照日 dissolve_date 为空（进行中）的团数，期末进行中同理。

# 主动解散（用户侧发起）：手动解散 / 离职(含换厅) / 注销
ACTIVE_DISS_REASON_SQL = "(dissolve_reason LIKE '%手动%' OR dissolve_reason LIKE '%离职%' OR dissolve_reason LIKE '%不在同一个大厅%' OR dissolve_reason LIKE '%注销%')"

# 已成团天数口径（2026-08-31）：已解散团用 dissolve_date − form_date（真实存活天数），
# 进行中团沿用 bigdata days_since_formed（「第N天」）。供所有展示位/计算位复用。
DAYS_SINCE_FORMED_SQL = ("CASE WHEN dissolve_date IS NOT NULL AND dissolve_date != '' "
                         "THEN CAST(julianday(dissolve_date) - julianday(form_date) AS INTEGER) "
                         "ELSE days_since_formed END")


def week_metrics_from_detail(conn, hall, ws, we):
    """按 team_detail 快照重算单周指标，返回与 weekly_report 行同构 dict（或 None）。
    所有团级计数均按 team_id 去重，规避快照重复行。
    期初/期末 = 该周 [ws, we] 内 MIN/MAX(snapshot_date)（周内最早/最晚快照日）；
    留存率 = (期末进行中 − 本周新成团) ÷ 期初进行中。"""
    hc = '' if hall == 'all' else 'AND hall_name = ?'
    hp = () if hall == 'all' else (hall,)
    snap = conn.execute(
        f"SELECT MIN(snapshot_date) AS s0, MAX(snapshot_date) AS s1 FROM team_detail "
        f"WHERE snapshot_date >= ? AND snapshot_date <= ? {hc}", (ws, we) + hp).fetchone()
    if not snap or not snap['s0']:
        return None
    s0, s1 = snap['s0'], snap['s1']

    def active_at(snap):
        return conn.execute(
            f"SELECT COUNT(DISTINCT team_id) AS n FROM team_detail "
            f"WHERE snapshot_date = ? AND (dissolve_date IS NULL OR dissolve_date = '') {hc}",
            (snap,) + hp).fetchone()['n']

    start, end = active_at(s0), active_at(s1)
    new = conn.execute(
        f"SELECT COUNT(DISTINCT team_id) AS n FROM team_detail "
        f"WHERE form_date >= ? AND form_date <= ? {hc}", (ws, we) + hp).fetchone()['n']
    # 非毕业解散（= 流失）：本周解散且原因 ≠ 毕业
    diss = conn.execute(
        f"SELECT COUNT(DISTINCT team_id) AS n FROM team_detail "
        f"WHERE dissolve_date >= ? AND dissolve_date <= ? AND dissolve_reason != '毕业' {hc}",
        (ws, we) + hp).fetchone()['n']
    # 毕业数：满30天正常毕业，单独口径，不算解散
    grad = conn.execute(
        f"SELECT COUNT(DISTINCT team_id) AS n FROM team_detail "
        f"WHERE dissolve_date >= ? AND dissolve_date <= ? AND dissolve_reason = '毕业' {hc}",
        (ws, we) + hp).fetchone()['n']
    # 主动解散（非毕业解散里由用户侧发起）
    active_diss = conn.execute(
        f"SELECT COUNT(DISTINCT team_id) AS n FROM team_detail "
        f"WHERE dissolve_date >= ? AND dissolve_date <= ? AND dissolve_reason != '毕业' "
        f"AND {ACTIVE_DISS_REASON_SQL} {hc}", (ws, we) + hp).fetchone()['n']
    # 系统解散 = 非毕业解散 − 主动解散
    sys_diss = diss - active_diss

    # 周流水近似：期末快照妹妹累计流水合计 − 期初快照合计（本周新挣）
    def rev_at(snap):
        return conn.execute(
            f"SELECT COALESCE(SUM(sister_revenue), 0) AS s FROM team_detail "
            f"WHERE snapshot_date = ? {hc}", (snap,) + hp).fetchone()['s']
    rev_end, rev_start = rev_at(s1), rev_at(s0)
    weekly_revenue = round(max(0.0, rev_end - rev_start), 1)

    # 活跃度 + 平均在榜天（期末快照）
    act = conn.execute(
        f"SELECT COALESCE(SUM(drive_task_count + accompany_task_count + gift_task_count), 0) AS t, "
        f"AVG(CASE WHEN dissolve_date IS NULL OR dissolve_date = '' THEN days_since_formed END) AS avgd "
        f"FROM team_detail WHERE snapshot_date = ? {hc}", (s1,) + hp).fetchone()
    activity_index = round(act['t'] / end, 2) if end > 0 else 0.0
    avg_days = round(act['avgd'], 1) if act['avgd'] is not None else None

    retention = round((end - new) / start * 100, 2) if start > 0 else 0.0
    dissolution = round(diss / start * 100, 2) if start > 0 else 0.0
    active_diss_pct = round(active_diss / diss * 100, 2) if diss > 0 else 0.0

    start_dt = datetime.strptime(ws, '%Y-%m-%d')
    end_dt = datetime.strptime(we, '%Y-%m-%d')
    return {
        'week_label': f"{start_dt.strftime('%m-%d')}~{end_dt.strftime('%m-%d')}",
        'week_start': ws, 'week_end': we, 'hall_name': hall,
        'new_team_count': new,
        'active_team_count_start': start, 'active_team_count_end': end,
        'dissolved_count': diss, 'active_dissolved_count': active_diss,
        'system_dissolved_count': sys_diss, 'graduation_count': grad,
        'retention_rate': retention, 'dissolution_rate': dissolution,
        'active_dissolved_pct': active_diss_pct,
        'weekly_revenue': weekly_revenue,
        'total_reward': weekly_revenue,  # 前端趋势图「流水」字段直接用
        'activity_index': activity_index,
        'avg_days': avg_days,
    }


def retention_by_hall(conn, ws, we):
    """单次聚合计算所有厅的留存率，供趋势结论层「最好/最差厅」使用。
    替代逐厅循环 week_metrics_from_detail（178 厅 × ~9 查询 → 7s 卡顿）。
    口径与 week_metrics_from_detail 完全一致：留存 = (期末进行中 − 本周新成团) ÷ 期初进行中，
    期初/期末 = 各厅在该周 MIN/MAX(snapshot_date)（周内最早/最晚快照日）。仅返回期初在榜 ≥5 团的厅。"""
    base = "AND hall_name IS NOT NULL AND hall_name != ''"

    def _active(agg):
        # 各厅在自身期初(或期末)快照日的进行中团数
        return {r['hall_name']: r['n'] for r in conn.execute(
            f"SELECT t.hall_name, COUNT(DISTINCT t.team_id) AS n FROM team_detail t "
            f"JOIN (SELECT hall_name, {agg} AS s FROM team_detail "
            f"      WHERE snapshot_date >= ? AND snapshot_date <= ? {base} GROUP BY hall_name) s "
            f"  ON t.hall_name = s.hall_name AND t.snapshot_date = s.s "
            f"WHERE (t.dissolve_date IS NULL OR t.dissolve_date = '') "
            f"GROUP BY t.hall_name", (ws, we)).fetchall()}

    start_map = _active('MIN(snapshot_date)')
    end_map = _active('MAX(snapshot_date)')
    new_map = {r['hall_name']: r['n'] for r in conn.execute(
        f"SELECT hall_name, COUNT(DISTINCT team_id) AS n FROM team_detail "
        f"WHERE form_date >= ? AND form_date <= ? {base} GROUP BY hall_name",
        (ws, we)).fetchall()}

    out = {}
    for h, start in start_map.items():
        if start >= 5:
            end = end_map.get(h, 0)
            new = new_map.get(h, 0)
            out[h] = round((end - new) / start * 100, 2)
    return out


def hall_weekly_revenue(conn, ws, we):
    """单次聚合计算各厅周增量流水（期末快照 sister_revenue 合计 − 期初快照合计），
    仿 retention_by_hall 避免逐厅循环。期初/期末 = 各厅在 [ws, we] 内 MIN/MAX(snapshot_date)。"""
    base = "AND hall_name IS NOT NULL AND hall_name != ''"
    snap = f"SELECT hall_name, MIN(snapshot_date) AS s0, MAX(snapshot_date) AS s1 FROM team_detail WHERE snapshot_date >= ? AND snapshot_date <= ? {base} GROUP BY hall_name"
    rev = f"SELECT hall_name, snapshot_date, SUM(sister_revenue) AS rev FROM team_detail WHERE snapshot_date >= ? AND snapshot_date <= ? {base} GROUP BY hall_name, snapshot_date"
    rows = conn.execute(f"""
        SELECT b.hall_name, COALESCE(e.rev, 0) - COALESCE(st.rev, 0) AS weekly_revenue
        FROM ({snap}) b
        LEFT JOIN ({rev}) st ON st.hall_name = b.hall_name AND st.snapshot_date = b.s0
        LEFT JOIN ({rev}) e  ON e.hall_name = b.hall_name AND e.snapshot_date = b.s1
    """, (ws, we, ws, we, ws, we)).fetchall()
    return {r['hall_name']: round(max(0.0, r['weekly_revenue'] or 0), 1) for r in rows}


def week_list_from_detail(conn, limit=16):
    """基于 team_detail 快照日推导周列表（周一为键，升序），供逐周重算。"""
    snaps = [r['snapshot_date'] for r in conn.execute(
        "SELECT DISTINCT snapshot_date FROM team_detail WHERE snapshot_date IS NOT NULL ORDER BY snapshot_date").fetchall()]
    weeks = {}
    for s in snaps:
        d = datetime.strptime(s, '%Y-%m-%d')
        ws = (d - timedelta(days=d.weekday())).strftime('%Y-%m-%d')
        we = (d - timedelta(days=d.weekday() - 6)).strftime('%Y-%m-%d')
        weeks.setdefault(ws, we)
    items = sorted(weeks.items())
    return items[-limit:] if limit else items


def _stats_daily_dedup_rows(conn, ws, we):
    """stats_daily 每 date_str 取 active_team_count 最大的一行（正确行）。
    08-01 起 stats_daily 出现「减半」双行：正确行 ~600 vs 减半行 ~360，
    减半行 id 更大，故不能用 MAX(id)；用 active_team_count DESC 取正确行。"""
    return conn.execute("""
        SELECT date_str, new_team_count, active_team_count, dissolved_count,
               active_dissolved_count, system_dissolved_count,
               drive_task_count, accompany_task_count, gift_task_count,
               level_achievement_count, revenue_achievement_count, reward_amount
        FROM (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY date_str ORDER BY active_team_count DESC, id DESC
            ) AS rn
            FROM stats_daily
            WHERE hall_name = '全部' AND date_str >= ? AND date_str <= ?
        ) WHERE rn = 1
    """, (ws, we)).fetchall()


def stats_daily_dedup_reward(conn, ws, we):
    """官方发放奖励周合计（全平台，去减半双行后求和）。"""
    s = sum(r['reward_amount'] or 0 for r in _stats_daily_dedup_rows(conn, ws, we))
    return round(s, 1)


def week_rows_all(conn, limit=0):
    """全平台逐周重算行（升序），total_reward 用官方奖励，供预警/导出复用。"""
    rows = []
    for ws, we in week_list_from_detail(conn, limit=limit):
        m = week_metrics_from_detail(conn, 'all', ws, we)
        if m:
            m['total_reward'] = stats_daily_dedup_reward(conn, ws, we)
            rows.append(m)
    return rows


# ========== API路由 ==========

@app.route('/api/search-suggest')
@login_required
def api_search_suggest():
    """模糊搜索建议：根据输入关键词返回匹配的昵称/UID/大厅名"""
    keyword = request.args.get('keyword', '').strip()
    if not keyword:
        return jsonify({'data': []})
    
    conn = get_db_conn()
    # 模糊匹配 sister_nickname、sister_nickname2、UID、hall_name、team_id
    like = f'%{keyword}%'
    cursor = conn.execute('''
        SELECT DISTINCT 
            sister_nickname as name,
            sister_uid as uid,
            hall_name,
            '姐姐' as role
        FROM team_detail
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
          AND (sister_nickname LIKE ? OR sister_uid LIKE ? OR hall_name LIKE ? OR CAST(team_id AS TEXT) LIKE ?)
          AND (sister_nickname IS NOT NULL AND sister_nickname != '')
        LIMIT 5
    ''', (like, like, like, like))
    rows1 = cursor.fetchall()
    
    cursor = conn.execute('''
        SELECT DISTINCT 
            sister_nickname2 as name,
            sister_uid2 as uid,
            hall_name,
            '妹妹' as role
        FROM team_detail
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
          AND (sister_nickname2 LIKE ? OR sister_uid2 LIKE ? OR hall_name LIKE ? OR CAST(team_id AS TEXT) LIKE ?)
          AND (sister_nickname2 IS NOT NULL AND sister_nickname2 != '')
        LIMIT 5
    ''', (like, like, like, like))
    rows2 = cursor.fetchall()
    conn.close()
    
    seen = set()
    suggestions = []
    for r in rows1 + rows2:
        key = f"{r['name']}|{r['uid']}"
        if key in seen or not r['name']:
            continue
        seen.add(key)
        suggestions.append({
            'name': r['name'],
            'uid': r['uid'] or '',
            'hall': r['hall_name'] or '',
            'role': r['role']
        })
    
    # 再补充大厅名建议（去重）
    conn = get_db_conn()
    cursor = conn.execute('''
        SELECT DISTINCT hall_name
        FROM team_detail
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
          AND hall_name LIKE ?
        LIMIT 3
    ''', (like,))
    hall_rows = cursor.fetchall()
    conn.close()
    
    for h in hall_rows:
        if h['hall_name'] and h['hall_name'] not in seen:
            seen.add(h['hall_name'])
            suggestions.append({
                'name': h['hall_name'],
                'uid': '',
                'hall': h['hall_name'],
                'role': '大厅'
            })
    
    return jsonify({'data': suggestions[:10]})


@app.route('/api/halls')
@login_required
def api_halls():
    """返回大厅列表，根据用户角色过滤"""
    user_uid = request.cookies.get('auth_uid')
    conn = get_db_conn()
    cursor = conn.execute('SELECT role FROM users WHERE uid = ?', (user_uid,))
    user = cursor.fetchone()
    role = user['role'] if user else 'admin'
    
    if role == 'admin':
        cursor = conn.execute('''
            SELECT DISTINCT hall_name FROM team_detail
            WHERE hall_name IS NOT NULL AND hall_name != ''
            ORDER BY hall_name
        ''')
        halls = [r['hall_name'] for r in cursor.fetchall()]
    else:
        # hall_manager：只返回管理的厅
        cursor = conn.execute('''
            SELECT hall_name FROM hall_managers WHERE uid = ? ORDER BY hall_name
        ''', (user_uid,))
        halls = [r['hall_name'] for r in cursor.fetchall()]
    
    conn.close()
    return jsonify({'data': halls, 'role': role})


@app.route('/api/hall-overview')
@login_required
def api_hall_overview():
    """工作台：当前用户可见大厅的近N周周报数据（厅运营=管理的厅，管理员=全部厅）"""
    user_uid = request.cookies.get('auth_uid')
    weeks = int(request.args.get('weeks', 7))
    conn = get_db_conn()
    row = conn.execute('SELECT role FROM users WHERE uid = ?', (user_uid,)).fetchone()
    role = row['role'] if row else 'admin'
    if role == 'admin':
        halls = [r['hall_name'] for r in conn.execute(
            "SELECT DISTINCT hall_name FROM team_detail WHERE hall_name IS NOT NULL AND hall_name != '' ORDER BY hall_name"
        ).fetchall()]
    else:
        halls = [r['hall_name'] for r in conn.execute(
            'SELECT hall_name FROM hall_managers WHERE uid = ? ORDER BY hall_name', (user_uid,)
        ).fetchall()]
    data = []
    # hall_revenue_daily 表可能尚未建立（首次部署/未抓取时），先探测一次
    has_hall_rev = conn.execute(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='hall_revenue_daily'"
    ).fetchone()['c'] > 0
    # 本月起始日期（用于厅排行榜「本周/本月」切换）
    month_start = datetime.now().date().replace(day=1).isoformat()
    # 姐妹团周流水（姐姐+妹妹当周礼物总流水合计，来自 team_sister_revenue 批量查询）
    has_sister_rev = conn.execute(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='team_sister_revenue'"
    ).fetchone()['c'] > 0
    latest_sw = None
    prev_sw = None
    if has_sister_rev:
        latest_sw = conn.execute('SELECT MAX(week_start) AS w FROM team_sister_revenue').fetchone()['w']
        prev_sw = conn.execute(
            'SELECT MAX(week_start) AS w FROM team_sister_revenue WHERE week_start < ?', (latest_sw,)
        ).fetchone()['w']
    for h in halls:
        # 逐周从 team_detail 重算（口径定稿 2026-08-17）
        week_items = week_list_from_detail(conn, limit=weeks)
        rows = []
        for ws, we in week_items:
            m = week_metrics_from_detail(conn, h, ws, we)
            if m:
                rows.append(m)
        if rows:
            week_list = rows
            # 合并真实厅周流水（hall_revenue_daily 按周区间求和；无数据为 None）
            for w in week_list:
                w['hall_revenue'] = None
                w['hall_revenue_days'] = 0
                if has_hall_rev:
                    rev = conn.execute(
                        'SELECT SUM(hall_revenue) AS s, COUNT(*) AS n FROM hall_revenue_daily WHERE hall_name = ? AND date >= ? AND date <= ?',
                        (h, w['week_start'], w['week_end'])).fetchone()
                    if rev['n']:
                        w['hall_revenue'] = round(rev['s'], 1)
                        w['hall_revenue_days'] = rev['n']
            # 本月汇总（厅月流水 / 姐妹团月流水 / 月新成团）
            month = {'revenue': None, 'sis_revenue': None, 'new_teams': 0}
            if has_hall_rev:
                mrev = conn.execute(
                    'SELECT SUM(hall_revenue) AS s, COUNT(*) AS n FROM hall_revenue_daily WHERE hall_name = ? AND date >= ?',
                    (h, month_start)).fetchone()
                if mrev['n']:
                    month['revenue'] = round(mrev['s'], 1)
            # 月汇总改从已重算的周行聚合（本月各周流水/新成团）
            month_rev = sum((w.get('weekly_revenue') or 0) for w in week_list if w['week_start'] >= month_start)
            month_new = sum((w.get('new_team_count') or 0) for w in week_list if w['week_start'] >= month_start)
            month['sis_revenue'] = round(month_rev, 1)
            month['new_teams'] = int(month_new)
            # 姐妹团周/月流水（真·流水 = 姐姐+妹妹当周礼物总流水合计）
            sister_weekly = None
            sister_monthly = None
            sister_prev_weekly = None
            if has_sister_rev:
                if latest_sw:
                    sw = conn.execute(
                        'SELECT SUM(total_revenue) AS s FROM team_sister_revenue WHERE hall_name = ? AND week_start = ?',
                        (h, latest_sw)).fetchone()
                    if sw and sw['s'] is not None:
                        sister_weekly = round(sw['s'], 1)
                if prev_sw:
                    sp = conn.execute(
                        'SELECT SUM(total_revenue) AS s FROM team_sister_revenue WHERE hall_name = ? AND week_start = ?',
                        (h, prev_sw)).fetchone()
                    if sp and sp['s'] is not None:
                        sister_prev_weekly = round(sp['s'], 1)
                sm = conn.execute(
                    'SELECT SUM(total_revenue) AS s FROM team_sister_revenue WHERE hall_name = ? AND week_start >= ?',
                    (h, month_start)).fetchone()
                if sm and sm['s'] is not None:
                    sister_monthly = round(sm['s'], 1)
            data.append({'hall_name': h, 'weeks': week_list, 'month': month,
                         'sister_weekly_revenue': sister_weekly, 'sister_monthly_revenue': sister_monthly,
                         'sister_prev_weekly_revenue': sister_prev_weekly})
    conn.close()
    return jsonify({'role': role, 'data': data})


@app.route('/api/kpi')
@login_required
def api_kpi():
    """KPI概览数据（8项核心指标），支持按大厅和周过滤"""
    hall = request.args.get('hall', 'all')
    week = request.args.get('week', '')
    conn = get_db_conn()

    weeks = week_list_from_detail(conn)
    if not weeks:
        conn.close()
        return jsonify({'error': '数据不足'}), 400

    # 选定周（缺省取最新一周），逐周从 team_detail 重算
    ws, we = weeks[-1]
    if week and '|' in week:
        ws, we = week.split('|')
    this_row = week_metrics_from_detail(conn, hall, ws, we)
    if not this_row:
        ws, we = weeks[-1]
        this_row = week_metrics_from_detail(conn, hall, ws, we)
    if not this_row:
        conn.close()
        return jsonify({'error': '该周暂无数据'}), 404

    # 上一周（重算）
    prev_row = None
    for (pws, pwe) in reversed(weeks):
        if pws < ws:
            prev_row = week_metrics_from_detail(conn, hall, pws, pwe)
            if prev_row:
                break
    if not prev_row:
        prev_row = {k: 0 for k in this_row.keys()}
        prev_row['week_start'] = prev_row['week_end'] = ''

    def calc_pct(curr, prev):
        if prev == 0: return 0
        return round((curr - prev) / prev * 100, 2)
    def getv(row, key, default=0):
        return row[key] if row else default

    # 官方发放奖励（仅全平台 stats_daily 有，单厅无此维度 → 0）
    this_reward = stats_daily_dedup_reward(conn, ws, we) if hall == 'all' else 0.0
    pws, pwe = prev_row.get('week_start'), prev_row.get('week_end')
    prev_reward = stats_daily_dedup_reward(conn, pws, pwe) if hall == 'all' and pws else 0.0

    # 成就达成率（仅全平台 stats_daily，去减半双行）
    def achieve_rate(ws2, we2):
        if hall != 'all':
            return 0.0
        rows = _stats_daily_dedup_rows(conn, ws2, we2)
        lvl = sum(r['level_achievement_count'] or 0 for r in rows)
        rev = sum(r['revenue_achievement_count'] or 0 for r in rows)
        act = sum(r['active_team_count'] or 0 for r in rows)
        tot = lvl + rev
        return round(tot / act * 100, 1) if act else 0
    this_achieve = achieve_rate(ws, we)
    prev_achieve = achieve_rate(pws, pwe) if pws else 0.0

    conn.close()

    this_retention = getv(this_row, 'retention_rate')
    prev_retention = getv(prev_row, 'retention_rate')
    kpis = {
        'new_team':      {'value': this_row['new_team_count'],      'change': calc_pct(this_row['new_team_count'], getv(prev_row, 'new_team_count')),      'unit': '个'},
        'active_team':   {'value': this_row['active_team_count_end'],'change': calc_pct(this_row['active_team_count_end'], getv(prev_row, 'active_team_count_end')), 'unit': '个'},
        'retention':     {'value': this_retention,                  'change': round(this_retention - prev_retention, 2),                                   'unit': '%'},
        'dissolution':   {'value': this_row['dissolution_rate'],    'change': round(this_row['dissolution_rate'] - getv(prev_row, 'dissolution_rate'), 2),   'unit': '%', 'reverse': True},
        'revenue':       {'value': this_reward, 'change': calc_pct(this_reward, prev_reward), 'unit': '元'},
        'activity':      {'value': this_row['activity_index'],      'change': round(this_row['activity_index'] - getv(prev_row, 'activity_index'), 2),      'unit': ''},
        'achievement':   {'value': this_achieve, 'change': round(this_achieve - prev_achieve, 2), 'unit': '%'},
        'active_dissolved_pct': {'value': this_row['active_dissolved_pct'], 'change': round(this_row['active_dissolved_pct'] - getv(prev_row, 'active_dissolved_pct'), 2), 'unit': '%', 'reverse': True},
    }
    return jsonify({'data': kpis, 'date': this_row['week_start'], 'week': this_row['week_label']})


@app.route('/api/trends')
@login_required
def api_trends():
    metric = request.args.get('metric', 'new_team_count')
    date_type = int(request.args.get('date_type', 1))
    
    conn = get_db_conn()
    cursor = conn.execute('''
        SELECT date_label, value FROM trend_data 
        WHERE metric_name = ? AND date_type = ? AND hall_name = 'all'
        ORDER BY date_label
    ''', (metric, date_type))
    rows = cursor.fetchall()
    conn.close()
    
    dates = [r['date_label'] for r in rows]
    values = [r['value'] for r in rows]
    
    return jsonify({'dates': dates, 'values': values, 'metric': metric})


@app.route('/api/daily-events')
@login_required
def api_daily_events():
    """日级成团/解散事件数（基于 team_detail 最新快照的 form_date / dissolve_date）"""
    hall = request.args.get('hall', 'all')
    days = min(int(request.args.get('days', 14)), 60)
    conn = get_db_conn()
    sql = """SELECT form_date, dissolve_date FROM team_detail
             WHERE rowid IN (SELECT MAX(rowid) FROM team_detail
                             WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                             GROUP BY team_id)"""
    params = []
    if hall != 'all':
        sql += ' AND hall_name = ?'
        params.append(hall)
    rows = conn.execute(sql, params).fetchall()
    ref = conn.execute('SELECT MAX(snapshot_date) AS ref FROM team_detail').fetchone()['ref']
    conn.close()
    if not ref:
        return jsonify({'dates': [], 'new_teams': [], 'dissolved': []})
    ref_date = datetime.strptime(ref, '%Y-%m-%d').date()
    new_map, diss_map = {}, {}
    for r in rows:
        fd = (r['form_date'] or '')[:10]
        dd = (r['dissolve_date'] or '')[:10]
        if fd:
            new_map[fd] = new_map.get(fd, 0) + 1
        if dd:
            diss_map[dd] = diss_map.get(dd, 0) + 1
    dates, new_teams, dissolved = [], [], []
    for i in range(days - 1, -1, -1):
        d = (ref_date - timedelta(days=i)).isoformat()
        dates.append(d)
        new_teams.append(new_map.get(d, 0))
        dissolved.append(diss_map.get(d, 0))
    return jsonify({'ref_date': ref, 'dates': dates, 'new_teams': new_teams, 'dissolved': dissolved})


@app.route('/api/survival')
@login_required
def api_survival():
    """姐妹团存活分析（最新快照）：进行中团天数分布 + 7/14/30日存活率 + 政策前后对比"""
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    sql = """SELECT form_date, dissolve_date, days_since_formed FROM team_detail
             WHERE rowid IN (SELECT MAX(rowid) FROM team_detail
                             WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                             GROUP BY team_id)"""
    params = []
    if hall != 'all':
        sql += ' AND hall_name = ?'
        params.append(hall)
    rows = conn.execute(sql, params).fetchall()
    ref = conn.execute('SELECT MAX(snapshot_date) AS ref FROM team_detail').fetchone()['ref']
    conn.close()
    if not rows or not ref:
        return jsonify({'error': '暂无数据'}), 404
    ref_date = datetime.strptime(ref, '%Y-%m-%d').date()
    policy_date = datetime(2026, 7, 17).date()

    def parse_d(s):
        s = (s or '')[:10]
        try:
            return datetime.strptime(s, '%Y-%m-%d').date()
        except Exception:
            return None

    # 进行中团的已成团天数分布
    bins = [('0-3天', 0, 3), ('4-7天', 4, 7), ('8-14天', 8, 14), ('15-30天', 15, 30), ('30天以上', 31, 10 ** 9)]
    hist = [0] * len(bins)
    active = 0
    for r in rows:
        if not (r['dissolve_date'] or '').strip():
            active += 1
            d = r['days_since_formed'] or 0
            for i, (_, lo, hi) in enumerate(bins):
                if lo <= d <= hi:
                    hist[i] += 1
                    break

    # T日存活率：成团已满T天的团中，存活达到T天的比例
    def survival(t, formed_after=None, formed_before=None):
        eligible = survived = 0
        for r in rows:
            fd = parse_d(r['form_date'])
            if not fd:
                continue
            if formed_after and fd < formed_after:
                continue
            if formed_before and fd >= formed_before:
                continue
            if (ref_date - fd).days < t:
                continue  # 尚未满T天，不纳入统计
            eligible += 1
            dd = parse_d(r['dissolve_date'])
            if not dd or (dd - fd).days >= t:
                survived += 1
        return {'rate': round(survived / eligible * 100, 1) if eligible else None, 'total': eligible}

    return jsonify({
        'ref_date': ref,
        'active_count': active,
        'hist_labels': [b[0] for b in bins],
        'hist_values': hist,
        'survival': {
            'd7': survival(7),
            'd14': survival(14),
            'd30': survival(30),
            'policy_pre_d7': survival(7, formed_before=policy_date),
            'policy_post_d7': survival(7, formed_after=policy_date),
        },
    })


# 政策后第一个完整周（07-17 在政策周 07-13~07-19 内，从下一周起算）
POLICY_WEEK_START = '2026-07-20'


@app.route('/api/policy-impact')
@login_required
def api_policy_impact():
    """政策效果评估：政策前4周 vs 政策后4周均值对比 + 分厅响应度排名。
    注：政策点 2026-07-20 早于 team_detail 首张快照(07-27)，政策前各周仅存在于 weekly_report，
    故本接口保留读 weekly_report（前端未接线，属历史分析口径）。"""
    hall = request.args.get('hall', 'all')
    user_uid = request.cookies.get('auth_uid')
    conn = get_db_conn()
    row = conn.execute('SELECT role FROM users WHERE uid = ?', (user_uid,)).fetchone()
    role = row['role'] if row else 'admin'

    def agg(h, direction):
        """direction: pre=政策前最近4周, post=政策后最早4周"""
        op = '<' if direction == 'pre' else '>='
        order = 'DESC' if direction == 'pre' else 'ASC'
        return conn.execute(f"""
            SELECT AVG(retention_rate) AS ret, AVG(dissolution_rate) AS dis,
                   AVG(total_reward) AS rev, AVG(new_team_count) AS nt, COUNT(*) AS n
            FROM (SELECT retention_rate, dissolution_rate, total_reward, new_team_count
                  FROM weekly_report WHERE hall_name = ? AND week_start {op} ?
                  ORDER BY week_start {order} LIMIT 4)
        """, (h, POLICY_WEEK_START)).fetchone()

    def pack(h):
        pre, post = agg(h, 'pre'), agg(h, 'post')
        if not pre['n'] or not post['n']:
            return None
        rev_delta_pct = round((post['rev'] - pre['rev']) / pre['rev'] * 100, 1) if pre['rev'] else None
        nt_delta_pct = round((post['nt'] - pre['nt']) / pre['nt'] * 100, 1) if pre['nt'] else None
        return {
            'ret_pre': round(pre['ret'], 1), 'ret_post': round(post['ret'], 1),
            'ret_delta': round(post['ret'] - pre['ret'], 1),
            'dis_pre': round(pre['dis'], 1), 'dis_post': round(post['dis'], 1),
            'dis_delta': round(post['dis'] - pre['dis'], 1),
            'rev_pre': round(pre['rev'], 1), 'rev_post': round(post['rev'], 1),
            'rev_delta_pct': rev_delta_pct,
            'nt_pre': round(pre['nt'], 1), 'nt_post': round(post['nt'], 1),
            'nt_delta_pct': nt_delta_pct,
        }

    # 当前筛选范围的总体对比
    overall = pack(hall)

    # 分厅响应度排名
    if role == 'admin':
        halls = [r['hall_name'] for r in conn.execute(
            "SELECT DISTINCT hall_name FROM weekly_report WHERE hall_name != 'all'").fetchall()]
    else:
        halls = [r['hall_name'] for r in conn.execute(
            'SELECT hall_name FROM hall_managers WHERE uid = ?', (user_uid,)).fetchall()]
    ranking = []
    for h in halls:
        p = pack(h)
        if p:
            ranking.append({'hall_name': h, **p})
    ranking.sort(key=lambda x: x['ret_delta'], reverse=True)
    conn.close()

    return jsonify({
        'policy_week_start': POLICY_WEEK_START,
        'hall': hall,
        'overall': overall,
        'ranking': ranking,
    })


@app.route('/api/policy-attribution')
@login_required
def api_policy_attribution():
    """政策归因：政策前后留存率/解散率变化按大厅存量规模加权，贡献(pp)加总=整体变化。
    注：同 policy-impact，政策前各周仅 weekly_report 有，保留读 weekly_report（前端未接线）。"""
    user_uid = request.cookies.get('auth_uid')
    conn = get_db_conn()
    role = conn.execute('SELECT role FROM users WHERE uid = ?', (user_uid,)).fetchone()
    role = role['role'] if role else 'admin'
    if role == 'admin':
        halls = [r['hall_name'] for r in conn.execute("SELECT DISTINCT hall_name FROM weekly_report WHERE hall_name != 'all'").fetchall()]
    else:
        halls = [r['hall_name'] for r in conn.execute('SELECT hall_name FROM hall_managers WHERE uid = ?', (user_uid,)).fetchall()]

    def agg(h, op, order):
        return conn.execute(f"""
            SELECT AVG(retention_rate) ret, AVG(dissolution_rate) dis, AVG(active_team_count_start) act
            FROM (SELECT retention_rate, dissolution_rate, active_team_count_start
                  FROM weekly_report WHERE hall_name = ? AND week_start {op} ?
                  ORDER BY week_start {order} LIMIT 4)
        """, (h, POLICY_WEEK_START)).fetchone()

    rows = []
    for h in halls:
        pre, post = agg(h, '<', 'DESC'), agg(h, '>=', 'ASC')
        if pre['ret'] is None or post['ret'] is None:
            continue
        ret_delta = post['ret'] - pre['ret']
        dis_delta = post['dis'] - pre['dis']
        scale = ((post['act'] or 0) + (pre['act'] or 0)) / 2
        rows.append({
            'hall_name': h,
            'ret_pre': round(pre['ret'], 1), 'ret_post': round(post['ret'], 1),
            'ret_delta': round(ret_delta, 1),
            'dis_delta': round(dis_delta, 1),
            'scale': round(scale, 0),
            '_ret_contrib': ret_delta * scale,
            '_dis_contrib': dis_delta * scale,
        })
    total_scale = sum(r['scale'] for r in rows) or 1
    for r in rows:
        r['ret_contrib'] = round(r.pop('_ret_contrib') / total_scale, 2)
        r['dis_contrib'] = round(r.pop('_dis_contrib') / total_scale, 2)
        r['share'] = round(r['scale'] / total_scale * 100, 1)
    rows.sort(key=lambda x: -x['ret_contrib'])
    conn.close()
    return jsonify({'policy_week_start': POLICY_WEEK_START, 'attribution': rows})


@app.route('/api/sister-profile')
@login_required
def api_sister_profile():
    """姐姐画像（周口径）：产出(周流水+环比) / 留存(带团存活率+平均成团天数) / 稳定性(在榜天数)"""
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()

    weeks = [r['week_start'] for r in conn.execute('SELECT DISTINCT week_start FROM team_sister_revenue ORDER BY week_start').fetchall()]
    cur_week = weeks[-1] if weeks else None
    prev_week = weeks[-2] if len(weeks) >= 2 else None
    # 时间周选择器（G 节）：week=YYYY-MM-DD|YYYY-MM-DD，取 week_start 定位历史某周
    week_param = request.args.get('week', '')
    if week_param and '|' in week_param:
        ws = week_param.split('|')[0]
        if ws in weeks:
            idx = weeks.index(ws)
            cur_week = ws
            prev_week = weeks[idx - 1] if idx > 0 else None

    hc = '' if hall == 'all' else 'AND hall_name = ?'
    hp = [] if hall == 'all' else [hall]
    latest = 'rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)'

    # 产出：本周/上周礼物流水（按姐姐聚合）
    rev = {}
    if cur_week:
        wk = [w for w in (prev_week, cur_week) if w]
        q = f"SELECT sister_uid, week_start, SUM(sister_revenue) AS rev FROM team_sister_revenue WHERE week_start IN ({','.join('?' * len(wk))}) {hc} GROUP BY sister_uid, week_start"
        for r in conn.execute(q, wk + hp).fetchall():
            rev.setdefault(r['sister_uid'], {})[r['week_start']] = r['rev'] or 0

    # 基础信息（最新快照的昵称/等级）
    base = {}
    rank_sql = _level_rank_sql('sister_level')
    for r in conn.execute(f"SELECT CAST(sister_uid AS TEXT) AS sister_uid, MAX(sister_nickname) AS nickname, MAX({rank_sql}) AS rank FROM team_detail WHERE {latest} {hc} GROUP BY sister_uid", hp).fetchall():
        base[r['sister_uid']] = {'sister_uid': r['sister_uid'], 'sister_nickname': r['nickname'], 'sister_level': LEVEL_NAMES.get(r['rank'], '无')}

    # 历史带团总数 + 在榜天数（全量快照）
    for r in conn.execute(f"SELECT CAST(sister_uid AS TEXT) AS sister_uid, COUNT(DISTINCT team_id) AS total_teams, COUNT(DISTINCT snapshot_date) AS presence_days, MAX(snapshot_date) AS last_seen FROM team_detail WHERE 1=1 {hc} GROUP BY sister_uid", hp).fetchall():
        d = base.setdefault(r['sister_uid'], {'sister_uid': r['sister_uid'], 'sister_nickname': None, 'sister_level': None})
        d.update(total_teams=r['total_teams'], presence_days=r['presence_days'], last_seen=r['last_seen'])

    # 进行中团数 + 平均成团天数（最新快照）
    for r in conn.execute(f"SELECT CAST(sister_uid AS TEXT) AS sister_uid, SUM(CASE WHEN dissolve_date IS NULL OR dissolve_date = '' THEN 1 ELSE 0 END) AS active_teams, AVG({DAYS_SINCE_FORMED_SQL}) AS avg_days FROM team_detail WHERE {latest} {hc} GROUP BY sister_uid", hp).fetchall():
        d = base.setdefault(r['sister_uid'], {'sister_uid': r['sister_uid'], 'sister_nickname': None, 'sister_level': None})
        d.update(active_teams=r['active_teams'], avg_days=round(r['avg_days'], 1) if r['avg_days'] is not None else None)

    # 姐妹关系持续率（2026-08-31 定稿）：已结束团（dissolve_date 非空）实际存续天数 ÷ (已结束团数 × 30)
    # 毕业团 clamp 30 天；解散团 dissolve_date − form_date；进行中团不进分子分母。
    ended = {}
    for r in conn.execute(f"""
        SELECT CAST(sister_uid AS TEXT) AS su,
               COUNT(*) AS ended_teams,
               COALESCE(SUM(CASE WHEN dissolve_reason = '毕业' THEN 30
                                 ELSE CAST(julianday(dissolve_date) - julianday(form_date) AS INTEGER) END), 0) AS total_days,
               SUM(CASE WHEN dissolve_reason = '毕业' THEN 1 ELSE 0 END) AS grad_teams
        FROM team_detail
        WHERE rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)
          AND dissolve_date IS NOT NULL AND dissolve_date != ''
          AND sister_uid IS NOT NULL AND sister_uid != '' {hc}
        GROUP BY su
    """, hp).fetchall():
        ended[r['su']] = r

    list_out = []
    for uid, s in base.items():
        week_rev = (rev.get(uid, {}).get(cur_week, 0)) if cur_week else 0
        prev_rev = (rev.get(uid, {}).get(prev_week, 0)) if prev_week else 0
        total_teams = s.get('total_teams') or 0
        active_teams = s.get('active_teams') or 0
        e = ended.get(uid)
        ended_teams = e['ended_teams'] if e else 0
        total_days = e['total_days'] if e else 0
        grad_teams = e['grad_teams'] if e else 0
        # 姐妹关系持续率 = Σ(已结束团存续天数) ÷ (已结束团数 × 30)
        retention = round(total_days / (ended_teams * 30) * 100, 1) if ended_teams else None
        # 带团毕业率（辅助副行）= 自然毕业团 ÷ 已结束团
        graduation_rate = round(grad_teams / ended_teams * 100, 1) if ended_teams else None
        wow = round((week_rev - prev_rev) / prev_rev * 100, 1) if prev_rev and prev_rev > 0 else None
        list_out.append({
            'sister_uid': uid,
            'sister_nickname': s.get('sister_nickname'),
            'sister_level': s.get('sister_level'),
            'week_rev': round(week_rev, 1),
            'prev_rev': round(prev_rev, 1),
            'rev_wow': wow,
            'total_teams': total_teams,
            'active_teams': active_teams,
            'retention': retention,
            'graduation_rate': graduation_rate,
            'avg_days': s.get('avg_days'),
            'presence_days': s.get('presence_days', 0),
            'last_seen': s.get('last_seen'),
        })

    revs = sorted(x['week_rev'] for x in list_out if x['week_rev'] > 0)
    p80 = revs[int(len(revs) * 0.8)] if revs else 0
    for x in list_out:
        r = x['retention']
        head = x['week_rev'] > 0 and x['week_rev'] >= p80 and r is not None and r >= 65
        risk = (x['rev_wow'] is not None and x['rev_wow'] <= -50 and x['prev_rev'] >= 1000) or (x['total_teams'] >= 3 and r is not None and r < 65)
        x['tag'] = 'head' if head else ('risk' if risk else 'normal')

    list_out.sort(key=lambda x: (-(x['week_rev'] or 0), -(x['retention'] or 0)))

    # 最近一周毕业的妹妹（满30天毕业 = dissolve_reason='毕业'）
    # 取每个妹妹最近一次毕业的那条快照，带上配对的姐姐（uid+昵称）
    # 毕业妹妹时间范围切换（J 节）：today / week / month，缺省 week
    grad_range = request.args.get('grad_range', 'week')
    grad_window = {'today': "date('now')", 'week': "date('now', '-7 day')",
                   'month': "date('now', '-30 day')"}.get(grad_range, "date('now', '-7 day')")
    recent_grad = conn.execute(f'''
        SELECT CAST(sister_uid2 AS TEXT) AS sister_uid2,
               sister_nickname2 AS nickname,
               hall_name, dissolve_date,
               CAST(sister_uid AS TEXT) AS sister_uid,
               sister_nickname AS sister_nickname,
               sister_max_level2, sister_revenue
        FROM team_detail td
        WHERE dissolve_reason = '毕业'
          AND date(dissolve_date) >= {grad_window} {hc}
          AND rowid = (
              SELECT MAX(rowid) FROM team_detail t2
              WHERE CAST(t2.sister_uid2 AS TEXT) = CAST(td.sister_uid2 AS TEXT)
                AND t2.dissolve_reason = '毕业'
          )
        ORDER BY dissolve_date DESC
    ''', hp).fetchall()
    recent_grad = [{
        'sister_uid2': r['sister_uid2'], 'nickname': r['nickname'],
        'hall_name': r['hall_name'], 'dissolve_date': r['dissolve_date'],
        'sister_uid': r['sister_uid'], 'sister_nickname': r['sister_nickname'],
        'sister_max_level2': r['sister_max_level2'] or '无',
        'sister_revenue': round(r['sister_revenue'] or 0, 1),
    } for r in recent_grad]
    conn.close()

    head_count = sum(1 for x in list_out if x['tag'] == 'head')
    risk_count = sum(1 for x in list_out if x['tag'] == 'risk')
    top = list_out[0] if list_out else None
    return jsonify({
        'cur_week': cur_week, 'prev_week': prev_week,
        'total': len(list_out),
        'summary': {
            'head_count': head_count, 'risk_count': risk_count,
            'top_sister': top['sister_nickname'] if top else None,
            'top_rev': top['week_rev'] if top else 0,
        },
        'recent_graduates': recent_grad,
        'list': list_out,
    })


@app.route('/api/sister2-profile')
@login_required
def api_sister2_profile():
    """妹妹→姐姐晋升追踪：妹妹产出/等级/活跃 + 晋升状态(是否已当姐姐)"""
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    hc = '' if hall == 'all' else 'AND hall_name = ?'
    hp = [] if hall == 'all' else [hall]
    promoted_set = {r['su'] for r in conn.execute('SELECT DISTINCT CAST(sister_uid AS TEXT) AS su FROM team_detail').fetchall()}

    # 妹妹基础 + 活跃（作为妹妹出现在哪些团/快照）
    base = {}
    rank_sql = _level_rank_sql('sister_max_level2')
    for r in conn.execute(f"""
        SELECT CAST(sister_uid2 AS TEXT) AS su, MAX(sister_nickname2) AS nickname, MAX({rank_sql}) AS rank,
               COUNT(DISTINCT team_id) AS team_count, COUNT(DISTINCT snapshot_date) AS presence_days,
               MAX({DAYS_SINCE_FORMED_SQL}) AS max_days
        FROM team_detail WHERE sister_uid2 IS NOT NULL AND sister_uid2 != '' {hc} GROUP BY su
    """, hp).fetchall():
        base[r['su']] = {
            'sister_uid': r['su'], 'sister_nickname': r['nickname'], 'level': LEVEL_NAMES.get(r['rank'], '无'),
            'level_rank': r['rank'],
            'team_count': r['team_count'], 'presence_days': r['presence_days'],
            'max_days': r['max_days'] or 0,
            'promoted': r['su'] in promoted_set,
        }

    # 妹妹本周产出（sister2_revenue）
    cur = conn.execute('SELECT MAX(week_start) AS w FROM team_sister_revenue').fetchone()['w']
    if cur:
        for r in conn.execute(f"""
            SELECT CAST(sister_uid2 AS TEXT) AS su, SUM(sister2_revenue) AS rev
            FROM team_sister_revenue WHERE week_start = ? AND sister_uid2 IS NOT NULL AND sister_uid2 != '' {hc} GROUP BY su
        """, [cur] + hp).fetchall():
            if r['su'] in base:
                base[r['su']]['week_rev'] = round(r['rev'] or 0, 1)
    for s in base.values():
        s.setdefault('week_rev', 0)

    list_out = list(base.values())
    for x in list_out:
        if x['promoted']:
            x['tag'] = 'promoted'
        elif x['max_days'] >= 30:  # 满30天=毕业线（与牌子/等级无关）
            x['tag'] = 'promotable'
        else:
            x['tag'] = 'normal'

    order = {'promoted': 0, 'promotable': 1, 'normal': 2}
    list_out.sort(key=lambda x: (order[x['tag']], -(x['week_rev'] or 0)))
    conn.close()

    return jsonify({
        'total': len(list_out),
        'summary': {
            'promoted': sum(1 for x in list_out if x['tag'] == 'promoted'),
            'promotable': sum(1 for x in list_out if x['tag'] == 'promotable'),
        },
        'list': list_out,
    })


@app.route('/api/talent-pool')
@login_required
def api_talent_pool():
    """培养力候选池（阶段B）：并列展示姐姐的留存/妹妹成长/共同成长/牌子等级，不排序"""
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    hc = '' if hall == 'all' else 'AND hall_name = ?'
    hp = [] if hall == 'all' else [hall]
    latest = 'rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)'
    rank_sql = _level_rank_sql('sister_level')
    score2_sql = _level_score_sql('sister_max_level2')  # 妹妹成长用难度加权分

    # 基础：昵称 + 牌子等级（最新快照）
    base = {}
    for r in conn.execute(f"""
        SELECT CAST(sister_uid AS TEXT) AS su, MAX(sister_nickname) AS nickname, MAX({rank_sql}) AS lv,
               GROUP_CONCAT(DISTINCT hall_name) AS halls
        FROM team_detail WHERE {latest} AND sister_uid IS NOT NULL AND sister_uid != '' {hc} GROUP BY su
    """, hp).fetchall():
        base[r['su']] = {'sister_uid': r['su'], 'sister_nickname': r['nickname'],
                         'level': LEVEL_NAMES.get(r['lv'], '无'), 'level_rank': r['lv'] or 0,
                         'halls': r['halls'] or ''}

    # 留存：历史带团总数 + 进行中团数（最新快照）
    for r in conn.execute(f"""
        SELECT CAST(sister_uid AS TEXT) AS su, COUNT(DISTINCT team_id) AS total_teams
        FROM team_detail WHERE sister_uid IS NOT NULL AND sister_uid != '' {hc} GROUP BY su
    """, hp).fetchall():
        d = base.setdefault(r['su'], {'sister_uid': r['su'], 'sister_nickname': None, 'level': None, 'level_rank': 0})
        d['total_teams'] = r['total_teams']
    for r in conn.execute(f"""
        SELECT CAST(sister_uid AS TEXT) AS su,
               SUM(CASE WHEN dissolve_date IS NULL OR dissolve_date = '' THEN 1 ELSE 0 END) AS active_teams
        FROM team_detail WHERE {latest} {hc} GROUP BY su
    """, hp).fetchall():
        d = base.setdefault(r['su'], {'sister_uid': r['su'], 'sister_nickname': None, 'level': None, 'level_rank': 0})
        d['active_teams'] = r['active_teams'] or 0

    # 姐妹关系持续率：已结束团实际存续天数 ÷ (已结束团数 × 30)
    ended = {}
    for r in conn.execute(f"""
        SELECT CAST(sister_uid AS TEXT) AS su,
               COUNT(*) AS ended_teams,
               COALESCE(SUM(CASE WHEN dissolve_reason = '毕业' THEN 30
                                 ELSE CAST(julianday(dissolve_date) - julianday(form_date) AS INTEGER) END), 0) AS total_days,
               SUM(CASE WHEN dissolve_reason = '毕业' THEN 1 ELSE 0 END) AS grad_teams
        FROM team_detail
        WHERE rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)
          AND dissolve_date IS NOT NULL AND dissolve_date != ''
          AND sister_uid IS NOT NULL AND sister_uid != '' {hc}
        GROUP BY su
    """, hp).fetchall():
        ended[r['su']] = r

    # 妹妹成长（按团：妹妹最高等级 Δscore / 团龄，score 为难度加权分）+ 培养升牌率（妹妹成长覆盖率 = 有成长团 ÷ 历史团）
    # 团龄口径：已解散团 dissolve_date − form_date，进行中团 days_since_formed（2026-08-31 修正）。
    growth = {}
    for r in conn.execute(f"""
        SELECT CAST(sister_uid AS TEXT) AS su,
               MAX({score2_sql}) - MIN({score2_sql}) AS gr,
               MAX(CASE WHEN dissolve_date IS NOT NULL AND dissolve_date != ''
                        THEN CAST(julianday(dissolve_date) - julianday(form_date) AS INTEGER)
                        ELSE days_since_formed END) AS days
        FROM team_detail WHERE sister_uid2 IS NOT NULL AND sister_uid2 != '' {hc}
        GROUP BY team_id
    """, hp).fetchall():
        su = r['su']
        g = growth.setdefault(su, {'teams': 0, 'grew': 0, 'gr_sum': 0.0})
        g['teams'] += 1
        gr = r['gr'] or 0
        days = r['days'] or 1
        if gr > 0:
            g['grew'] += 1
            g['gr_sum'] += gr / days

    for su, g in growth.items():
        d = base.setdefault(su, {'sister_uid': su, 'sister_nickname': None, 'level': None, 'level_rank': 0})
        d['grew_teams'] = g['grew']
        # 妹妹成长（每月成长分，只对有成长的团取平均：÷ g['grew']）
        d['sister_growth'] = round(g['gr_sum'] / g['grew'] * 30, 2) if g['grew'] else 0
        # 培养升牌率（妹妹成长覆盖率 = 有成长团 ÷ 历史带团总数，去掉「团存活」条件）
        d['joint_growth'] = round(g['grew'] / g['teams'] * 100, 1) if g['teams'] else 0

    list_out = []
    for su, s in base.items():
        total_teams = s.get('total_teams') or 0
        active_teams = s.get('active_teams') or 0
        e = ended.get(su)
        ended_teams = e['ended_teams'] if e else 0
        total_days = e['total_days'] if e else 0
        grad_teams = e['grad_teams'] if e else 0
        # 姐妹关系持续率（主指标）= Σ(已结束团存续天数) ÷ (已结束团数 × 30)
        retention = round(total_days / (ended_teams * 30) * 100, 1) if ended_teams else None
        # 带团毕业率（辅助）= 自然毕业团 ÷ 已结束团
        graduation_rate = round(grad_teams / ended_teams * 100, 1) if ended_teams else None
        s.setdefault('sister_growth', 0)
        s.setdefault('joint_growth', 0)
        s.setdefault('grew_teams', 0)
        s['retention'] = retention
        s['graduation_rate'] = graduation_rate
        s['active_teams'] = active_teams
        # 候选判定：持续率 ≥ 65% + 妹妹有成长 + 牌子 ≥ 银牌(level_rank≥4)
        s['candidate'] = (retention is not None and retention >= 65) and s['sister_growth'] > 0 and s['level_rank'] >= 4
        # 培养力总分（v1，满分100，仅排序参考不进候选硬门槛）= 0.4×持续率 + 0.35×妹妹成长(封顶T=20) + 0.25×培养升牌率
        s['total_score'] = round(0.4 * retention + 0.35 * (min(s['sister_growth'], 20) / 20 * 100) + 0.25 * s['joint_growth'], 1) if retention is not None else None
        list_out.append(s)

    # 并列展示：候选优先分组，再按牌子等级，非权威排序
    list_out.sort(key=lambda x: (not x['candidate'], -(x['level_rank'] or 0), x['sister_nickname'] or ''))
    conn.close()

    candidate_count = sum(1 for x in list_out if x['candidate'])
    return jsonify({
        'total': len(list_out),
        'candidate_count': candidate_count,
        'list': list_out,
    })


@app.route('/api/talent-actions', methods=['GET', 'POST'])
@login_required
def api_talent_actions():
    """结果记录：POST 记录一次倾斜动作；GET 列出已记录动作"""
    conn = get_db_conn()
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        sister_uid = str(data.get('sister_uid', '')).strip()
        action_type = data.get('action_type', '').strip()
        action_date = data.get('action_date', '').strip()
        if not sister_uid or action_type not in ('send_sister', 'promote') or not action_date:
            conn.close()
            return jsonify({'success': False, 'error': '参数不完整'}), 400
        conn.execute(
            'INSERT INTO talent_actions (sister_uid, sister_nickname, hall_name, action_type, action_date, note) VALUES (?,?,?,?,?,?)',
            (sister_uid, data.get('sister_nickname', ''), data.get('hall_name', ''), action_type, action_date, data.get('note', ''))
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True})

    rows = conn.execute('SELECT * FROM talent_actions ORDER BY action_date DESC, id DESC').fetchall()
    conn.close()
    return jsonify({'list': rows})


@app.route('/api/talent-actions/<int:aid>/result', methods=['POST'])
@login_required
def api_talent_action_result(aid):
    """补填某次倾斜动作的结果（动作→结果 配对，用于学习培养力权重）"""
    data = request.get_json(silent=True) or {}
    result_status = data.get('result_status', 'pending')
    if result_status not in ('pending', 'good', 'mixed', 'bad'):
        result_status = 'pending'
    conn = get_db_conn()
    cur = conn.execute(
        'UPDATE talent_actions SET result_sister_promoted=?, result_team_alive=?, result_revenue_up=?, '
        'result_status=?, result_note=?, result_date=?, result_updated_at=CURRENT_TIMESTAMP WHERE id=?',
        (data.get('result_sister_promoted'), data.get('result_team_alive'), data.get('result_revenue_up'),
         result_status, data.get('result_note', ''), data.get('result_date', ''), aid)
    )
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        return jsonify({'success': False, 'error': '记录不存在'}), 404
    conn.close()
    return jsonify({'success': True})


@app.route('/api/sister2-detail')
@login_required
def api_sister2_detail():
    """妹妹活动追踪下钻：等级成长轨迹 + 周产出 + 参与团"""
    uid = request.args.get('uid', '')
    if not uid:
        return jsonify({'error': '缺少 uid'}), 400
    conn = get_db_conn()
    promoted_set = {r['su'] for r in conn.execute('SELECT DISTINCT CAST(sister_uid AS TEXT) AS su FROM team_detail').fetchall()}
    rank_sql = _level_rank_sql('sister_max_level2')
    cur_rank_sql = _level_rank_sql('sister_level2')

    base = conn.execute(f"""
        SELECT MAX(sister_nickname2) AS nickname, MAX({rank_sql}) AS max_rank,
               COUNT(DISTINCT team_id) AS team_count, COUNT(DISTINCT snapshot_date) AS presence_days
        FROM team_detail WHERE CAST(sister_uid2 AS TEXT) = ? AND sister_uid2 IS NOT NULL AND sister_uid2 != ''
    """, [uid]).fetchone()
    if not base or base['team_count'] is None:
        conn.close()
        return jsonify({'error': '未找到该妹妹'}), 404

    track_rows = conn.execute(f"""
        SELECT snapshot_date, MAX({rank_sql}) AS r FROM team_detail
        WHERE CAST(sister_uid2 AS TEXT) = ?
        GROUP BY snapshot_date ORDER BY snapshot_date
    """, [uid]).fetchall()
    level_track = [{'date': r['snapshot_date'], 'rank': r['r'] or 0, 'level': LEVEL_NAMES.get(r['r'] or 0, '无')} for r in track_rows]

    cur = conn.execute(f"""
        SELECT {cur_rank_sql} AS r FROM team_detail
        WHERE CAST(sister_uid2 AS TEXT) = ? AND snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
        ORDER BY rowid DESC LIMIT 1
    """, [uid]).fetchone()

    weekly = conn.execute("SELECT week_start, SUM(sister2_revenue) AS rev FROM team_sister_revenue WHERE CAST(sister_uid2 AS TEXT) = ? GROUP BY week_start ORDER BY week_start", [uid]).fetchall()

    teams = conn.execute(f"""
        SELECT team_id, hall_name, sister_nickname, sister_level2, dissolve_date
        FROM team_detail WHERE CAST(sister_uid2 AS TEXT) = ? AND rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)
        ORDER BY CASE WHEN dissolve_date IS NULL OR dissolve_date = '' THEN 0 ELSE 1 END, team_id DESC
    """, [uid]).fetchall()

    conn.close()
    return jsonify({
        'uid': uid,
        'nickname': base['nickname'],
        'level': LEVEL_NAMES.get(cur['r'], '无') if cur else '无',
        'max_level': LEVEL_NAMES.get(base['max_rank'], '无'),
        'promoted': uid in promoted_set,
        'team_count': base['team_count'],
        'presence_days': base['presence_days'],
        'level_track': level_track,
        'weekly': [{'week': w['week_start'], 'rev': w['rev'] or 0} for w in weekly],
        'teams': [{
            'team_id': t['team_id'], 'hall_name': t['hall_name'],
            'captain': t['sister_nickname'], 'level': t['sister_level2'],
            'status': 'active' if (not t['dissolve_date'] or t['dissolve_date'] == '') else 'dissolved',
        } for t in teams],
    })


@app.route('/api/sister-detail')
@login_required
def api_sister_detail():
    """姐姐下钻：基本画像 + 带团明细 + 每日/周流水趋势"""
    uid = request.args.get('uid', '')
    if not uid:
        return jsonify({'error': '缺少 uid'}), 400
    conn = get_db_conn()
    latest = 'rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)'
    rank_sql = _level_rank_sql('sister_level')

    base = conn.execute(f"SELECT MAX(sister_nickname) AS nickname, MAX({rank_sql}) AS rank, COUNT(DISTINCT team_id) AS total_teams FROM team_detail WHERE CAST(sister_uid AS TEXT) = ? AND {latest}", [uid]).fetchone()
    if not base or base['total_teams'] is None:
        conn.close()
        return jsonify({'error': '未找到该姐姐'}), 404
    act = conn.execute(f"SELECT SUM(CASE WHEN dissolve_date IS NULL OR dissolve_date = '' THEN 1 ELSE 0 END) AS active_teams, AVG({DAYS_SINCE_FORMED_SQL}) AS avg_days FROM team_detail WHERE CAST(sister_uid AS TEXT) = ? AND {latest}", [uid]).fetchone()
    pres = conn.execute("SELECT COUNT(DISTINCT snapshot_date) AS presence_days FROM team_detail WHERE CAST(sister_uid AS TEXT) = ?", [uid]).fetchone()
    teams = conn.execute(f"""
        SELECT team_id, hall_name, {DAYS_SINCE_FORMED_SQL} AS days_since_formed, reward_amount, dissolve_date, sister_nickname2
        FROM team_detail WHERE CAST(sister_uid AS TEXT) = ? AND {latest}
        ORDER BY CASE WHEN dissolve_date IS NULL OR dissolve_date = '' THEN 0 ELSE 1 END, days_since_formed DESC
    """, [uid]).fetchall()
    daily = conn.execute("""
        SELECT snapshot_date, SUM(sister_revenue) AS rev FROM team_detail
        WHERE CAST(sister_uid AS TEXT) = ? AND rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id, snapshot_date)
        GROUP BY snapshot_date ORDER BY snapshot_date
    """, [uid]).fetchall()
    weekly = conn.execute("SELECT week_start, SUM(sister_revenue) AS rev FROM team_sister_revenue WHERE CAST(sister_uid AS TEXT) = ? GROUP BY week_start ORDER BY week_start", [uid]).fetchall()
    track_rows = conn.execute(f"""
        SELECT snapshot_date, MAX({rank_sql}) AS r FROM team_detail
        WHERE CAST(sister_uid AS TEXT) = ?
        GROUP BY snapshot_date ORDER BY snapshot_date
    """, [uid]).fetchall()
    conn.close()

    total = base['total_teams'] or 0
    active = act['active_teams'] or 0
    return jsonify({
        'uid': uid,
        'nickname': base['nickname'],
        'level': LEVEL_NAMES.get(base['rank'], '无'),
        'total_teams': total,
        'active_teams': active,
        'retention': round(active / total * 100, 1) if total else None,
        'avg_days': round(act['avg_days'], 1) if act['avg_days'] is not None else None,
        'presence_days': pres['presence_days'] or 0,
        'level_track': [{'date': r['snapshot_date'], 'rank': r['r'] or 0, 'level': LEVEL_NAMES.get(r['r'] or 0, '无')} for r in track_rows],
        'teams': [{
            'team_id': t['team_id'], 'hall_name': t['hall_name'],
            'days_since_formed': t['days_since_formed'], 'reward_amount': t['reward_amount'],
            'status': 'active' if (not t['dissolve_date'] or t['dissolve_date'] == '') else 'dissolved',
            'sister2': t['sister_nickname2'],
        } for t in teams],
        'daily': [{'date': d['snapshot_date'], 'rev': d['rev'] or 0} for d in daily],
        'weekly': [{'week': w['week_start'], 'rev': w['rev'] or 0} for w in weekly],
    })


@app.route('/api/captains')
@login_required
def api_captains():
    """姐姐（团长）维度：带团数/当日奖励/团存活率排行 + 各厅头牌依赖度"""
    hall = request.args.get('hall', 'all')
    limit = min(int(request.args.get('limit', 50)), 200)
    conn = get_db_conn()
    ref = conn.execute('SELECT MAX(snapshot_date) AS ref FROM team_detail').fetchone()['ref']
    period = request.args.get('period', 'day')  # day=快照当日 / week=本周累计 / month=本月累计

    if period in ('week', 'month'):
        # 周/月口径：跨快照按 (team_id, snapshot_date) 去重后累计奖励
        ref_d = datetime.strptime(ref, '%Y-%m-%d').date()
        start = (ref_d - timedelta(days=ref_d.weekday())) if period == 'week' else ref_d.replace(day=1)
        hall_cond = "AND s.hall_name = ?" if hall != 'all' else ''
        hall_cond_inner = "AND l.hall_name = ?" if hall != 'all' else ''
        params = [start.isoformat(), ref]
        if hall != 'all':
            params += [hall, hall]  # 外层 s 厅过滤 + 内层 active_count 厅过滤
        params.append(limit)
        rows = conn.execute(f"""
            WITH snap AS (
              SELECT * FROM team_detail
              WHERE rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id, snapshot_date)
                AND snapshot_date >= ? AND snapshot_date <= ?
            ),
            latest AS (
              SELECT * FROM team_detail
              WHERE rowid IN (SELECT MAX(rowid) FROM team_detail
                              WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                              GROUP BY team_id)
            )
            SELECT s.sister_uid,
                   MAX(s.sister_nickname) AS nickname,
                   GROUP_CONCAT(DISTINCT s.hall_name) AS halls,
                   COUNT(DISTINCT s.team_id) AS team_count,
                   (SELECT COUNT(*) FROM latest l WHERE l.sister_uid = s.sister_uid
                     AND (l.dissolve_date = '' OR l.dissolve_date IS NULL) {hall_cond_inner}) AS active_count,
                   SUM(s.reward_amount) AS total_reward
            FROM snap s
            WHERE s.sister_uid IS NOT NULL AND s.sister_uid != '' {hall_cond}
            GROUP BY s.sister_uid ORDER BY total_reward DESC LIMIT ?
        """, params).fetchall()
    else:
        # 当日口径：最新快照
        sql = """SELECT sister_uid, MAX(sister_nickname) AS nickname,
                        GROUP_CONCAT(DISTINCT hall_name) AS halls,
                        COUNT(*) AS team_count,
                        SUM(CASE WHEN dissolve_date = '' OR dissolve_date IS NULL THEN 1 ELSE 0 END) AS active_count,
                        SUM(reward_amount) AS total_reward
                 FROM team_detail
                 WHERE rowid IN (SELECT MAX(rowid) FROM team_detail
                                 WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                                 GROUP BY team_id)
                   AND sister_uid IS NOT NULL AND sister_uid != ''"""
        params = []
        if hall != 'all':
            sql += ' AND hall_name = ?'
            params.append(hall)
        sql += ' GROUP BY sister_uid ORDER BY total_reward DESC LIMIT ?'
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
    captains = [{
        'uid': r['sister_uid'],
        'nickname': r['nickname'] or r['sister_uid'],
        'halls': r['halls'] or '',
        'team_count': r['team_count'],
        'active_count': r['active_count'],
        'total_reward': round(r['total_reward'] or 0, 1),
    } for r in rows]

    conn.close()

    return jsonify({'data': captains, 'ref_date': ref, 'period': period, 'metric_note': 'reward_amount 为快照当日发放的礼物奖励金额，非累计总流水；累计总流水请在 UID 查询中查看'})


@app.route('/api/trend-insights')
@login_required
def api_trend_insights():
    """趋势图结论层：为工作台4张周级趋势图提供点名式结论（哪个厅 / 什么原因 / 找谁）"""
    hall = request.args.get('hall', 'all')
    week_param = request.args.get('week', '')  # 'YYYY-MM-DD|YYYY-MM-DD'
    conn = get_db_conn()

    # 最新快照日期 + 所选周区间（缺省用最新快照所在周）
    ref = conn.execute('SELECT MAX(snapshot_date) AS ref FROM team_detail').fetchone()['ref']
    ref_d = datetime.strptime(ref, '%Y-%m-%d').date()
    if week_param and '|' in week_param:
        ws, we = week_param.split('|')[0], week_param.split('|')[1]
    else:
        ws = (ref_d - timedelta(days=ref_d.weekday())).isoformat()
        we = (ref_d - timedelta(days=ref_d.weekday() - 6)).isoformat()

    hall_cond = '' if hall == 'all' else 'AND hall_name = ?'
    hp = [] if hall == 'all' else [hall]
    latest_teams = 'rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)'

    out = {}

    # ── 1) 解散：本周解散团数 + 主因 + 集中厅 ──
    diss_count = conn.execute(
        f"SELECT COUNT(*) AS c FROM team_detail WHERE {latest_teams} AND date(dissolve_date) BETWEEN ? AND ? {hall_cond}",
        [ws, we] + hp).fetchone()['c']
    reason_row = hall_row = None
    if diss_count:
        reason_row = conn.execute(
            f"SELECT {DISSOLVE_REASON_CASE} AS reason, COUNT(*) AS c FROM team_detail WHERE {latest_teams} AND date(dissolve_date) BETWEEN ? AND ? {hall_cond} GROUP BY reason ORDER BY c DESC LIMIT 1",
            [ws, we] + hp).fetchone()
        hall_row = conn.execute(
            f"SELECT hall_name, COUNT(*) AS c FROM team_detail WHERE {latest_teams} AND date(dissolve_date) BETWEEN ? AND ? {hall_cond} GROUP BY hall_name ORDER BY c DESC LIMIT 1",
            [ws, we] + hp).fetchone()
    out['dissolution'] = {
        'count': diss_count,
        'top_reason': reason_row['reason'] if reason_row else '',
        'top_reason_count': reason_row['c'] if reason_row else 0,
        'top_hall': hall_row['hall_name'] if hall_row else '',
        'top_hall_count': hall_row['c'] if hall_row else 0,
    }

    # ── 2) 流水：本周 TOP 姐姐（team_sister_revenue 姐姐周流水，与厅排行榜口径一致） ──
    out['revenue'] = None
    sw = conn.execute('SELECT MAX(week_start) AS w FROM team_sister_revenue WHERE week_start <= ?', (we,)).fetchone()['w']
    if sw and sw == ws:
        r = conn.execute(f"""
            SELECT sister_uid, SUM(sister_revenue) AS rev, GROUP_CONCAT(DISTINCT hall_name) AS halls
            FROM team_sister_revenue
            WHERE week_start = ? AND sister_revenue > 0 {hall_cond}
            GROUP BY sister_uid ORDER BY rev DESC LIMIT 1
        """, [sw] + hp).fetchone()
        if r:
            nick = conn.execute('SELECT MAX(sister_nickname) AS n FROM team_detail WHERE sister_uid = ?', (r['sister_uid'],)).fetchone()['n']
            total = conn.execute(
                f"SELECT SUM(total_revenue) AS t FROM team_sister_revenue WHERE week_start = ? {hall_cond}",
                [sw] + hp).fetchone()['t'] or 0
            out['revenue'] = {
                'top_sister': nick or str(r['sister_uid']),
                'top_sister_uid': r['sister_uid'],
                'top_sister_rev': round(r['rev'] or 0, 1),
                'share': round((r['rev'] or 0) / total * 100, 1) if total else 0,
                'top_sister_hall': r['halls'],
            }

    # ── 3) 任务活跃度：TOP 姐姐（最新快照任务合计） ──
    r = conn.execute(f"""
        SELECT sister_uid, MAX(sister_nickname) AS nickname,
               SUM(drive_task_count + accompany_task_count + gift_task_count) AS tasks
        FROM team_detail
        WHERE rowid IN (SELECT MAX(rowid) FROM team_detail
                        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                        GROUP BY team_id)
          AND sister_uid IS NOT NULL AND sister_uid != '' {hall_cond}
        GROUP BY sister_uid ORDER BY tasks DESC LIMIT 1
    """, hp).fetchone()
    out['activity'] = {
        'top_sister': r['nickname'] if r else None,
        'top_sister_uid': str(r['sister_uid']) if r else None,
        'tasks': round(r['tasks'] or 0) if r else 0,
    } if r and r['tasks'] else None

    # ── 4) 留存：最好/最差厅（或单厅 vs 平台均值），基于 team_detail 重算 ──
    # 仅统计期初在榜 ≥5 团的厅，过滤 1~2 团长尾厅的极端留存（100% / -100% 无意义）
    # retention_by_hall 单次聚合（3 条 GROUP BY 查询），替代逐厅循环（~1600 查询）
    rets = retention_by_hall(conn, ws, we)   # {hall_name: retention_rate}
    if hall == 'all':
        if rets:
            best = max(rets.items(), key=lambda x: x[1])
            worst = min(rets.items(), key=lambda x: x[1])
            out['retention'] = {
                'best_hall': best[0], 'best_rate': round(best[1], 1),
                'worst_hall': worst[0], 'worst_rate': round(worst[1], 1),
            }
        else:
            out['retention'] = {'best_hall': '', 'best_rate': None, 'worst_hall': '', 'worst_rate': None}
    else:
        own_m = week_metrics_from_detail(conn, hall, ws, we)
        own = own_m['retention_rate'] if own_m else None
        avg = round(sum(rets.values()) / len(rets), 1) if rets else None
        out['retention'] = {
            'rate': round(own, 1) if own is not None else None,
            'avg': avg,
        }

    conn.close()
    return jsonify({'week_start': ws, 'week_end': we, 'ref_date': ref, **out})


@app.route('/api/dissolve-reasons')
@login_required
def api_dissolve_reasons():
    """解散原因分布：已解散姐妹团按归一化原因统计（支持按大厅过滤）"""
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    ref = conn.execute('SELECT MAX(snapshot_date) AS ref FROM team_detail').fetchone()['ref']
    hall_cond = '' if hall == 'all' else 'AND hall_name = ?'
    hp = [] if hall == 'all' else [hall]
    latest_teams = 'rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)'
    rows = conn.execute(f"""
        SELECT {DISSOLVE_REASON_CASE} AS reason, COUNT(*) AS c
        FROM team_detail
        WHERE {latest_teams} AND dissolve_date IS NOT NULL AND dissolve_date != ''
          {hall_cond}
        GROUP BY reason ORDER BY c DESC
    """, hp).fetchall()
    total = sum(r['c'] for r in rows)
    reasons = [{
        'reason': r['reason'],
        'count': r['c'],
        'share': round(r['c'] / total * 100, 1) if total else 0,
    } for r in rows]
    conn.close()
    return jsonify({'ref_date': ref, 'total': total, 'reasons': reasons})


@app.route('/api/lying-flat')
@login_required
def api_lying_flat():
    """躺平预警名单：进行中团里连续≥4天未完成「陪档」的团，接近自动解散（自动解散线=连续5日未陪档）"""
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    dates = [r['snapshot_date'] for r in conn.execute('SELECT DISTINCT snapshot_date FROM team_detail ORDER BY snapshot_date').fetchall()]
    if len(dates) < 2:
        conn.close()
        return jsonify({'ref_date': dates[-1] if dates else '', 'prev_date': '', 'summary': {'lying': 0, 'warning': 0, 'accompany_rate': 0}, 'days_dist': [], 'hall_dist': [], 'list': []})
    latest, prev = dates[-1], dates[-2]
    hall_cond = '' if hall == 'all' else 'AND hall_name = ?'
    hp = [] if hall == 'all' else [hall]
    active_rows = conn.execute(f"""
        SELECT team_id, hall_name, sister_nickname, sister_uid, days_since_formed, form_date
        FROM team_detail
        WHERE rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)
          AND (dissolve_date IS NULL OR dissolve_date = '')
          {hall_cond}
    """, hp).fetchall()
    # 每个团在每个快照日是否完成过「陪档」（同日多行取 MAX；只盯陪档单项，不看开车/收送礼）
    tm = {}
    for r in conn.execute("""
            SELECT team_id, snapshot_date,
                   MAX(accompany_task_count > 0) AS a
            FROM team_detail GROUP BY team_id, snapshot_date
        """).fetchall():
        tm[(r['team_id'], r['snapshot_date'])] = r['a']
    lst = []
    for t in active_rows:
        tid = t['team_id']
        fd = t['form_date']
        streak, i = 0, len(dates) - 1
        # 从最新快照日往前数连续未陪档天数；成团日（form_date）之前的快照不计入，避免新团被误判为长期躺平
        while i >= 0 and not tm.get((tid, dates[i]), 0):
            if fd and dates[i] < fd:
                break
            streak += 1
            i -= 1
        if streak < 1:
            continue
        lst.append({
            'team_id': tid,
            'hall_name': t['hall_name'],
            'sister_nickname': t['sister_nickname'],
            'sister_uid': t['sister_uid'],
            'days_since_formed': t['days_since_formed'],
            'accompany_streak': streak,
            'last_active': dates[i] if (i >= 0 and tm.get((tid, dates[i]), 0)) else None,
            'level': 'lying' if streak >= 4 else 'warning',
        })
    lst.sort(key=lambda x: (-x['accompany_streak'], x['days_since_formed'] or 0))
    cov = conn.execute("""
        SELECT COUNT(*) total, SUM(accompany_task_count > 0) a
        FROM team_detail
        WHERE rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)
          AND (dissolve_date IS NULL OR dissolve_date = '')
    """).fetchone()
    accompany_rate = round(cov['a'] / cov['total'] * 100, 1) if cov['total'] else 0
    # 汇总：躺平(≥4) / 提醒(1~3) / 陪档活跃率 + 连续未陪档天数分布 + 大厅分布（供预警中心下钻）
    lying_n = sum(1 for x in lst if x['level'] == 'lying')
    warning_n = sum(1 for x in lst if x['level'] == 'warning')
    days_dist = []
    for lo, hi, label in ((4, 4, '4天'), (5, 5, '5天'), (6, 6, '6天'), (7, 7, '7天'), (8, 10 ** 9, '8天及以上')):
        days_dist.append({'label': label, 'count': sum(1 for x in lst if lo <= x['accompany_streak'] <= hi)})
    hall_counter = {}
    for x in lst:
        hall_counter[x['hall_name']] = hall_counter.get(x['hall_name'], 0) + 1
    hall_dist = sorted(({'hall': h, 'count': c} for h, c in hall_counter.items()), key=lambda x: -x['count'])
    conn.close()
    return jsonify({
        'ref_date': latest, 'prev_date': prev,
        'summary': {'lying': lying_n, 'warning': warning_n, 'accompany_rate': accompany_rate},
        'days_dist': days_dist, 'hall_dist': hall_dist,
        'list': lst,
    })


@app.route('/api/lying-detail')
@login_required
def api_lying_detail():
    """躺平下钻：某团逐日任务完成明细（开车/陪档/收送礼），验证「连续零任务」判定"""
    team_id = request.args.get('team_id', '')
    if not team_id:
        return jsonify({'error': '缺少 team_id'}), 400
    conn = get_db_conn()
    info = conn.execute("""
        SELECT team_id, hall_name, sister_nickname, sister_uid, days_since_formed, dissolve_date
        FROM team_detail WHERE CAST(team_id AS TEXT) = ? AND rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)
    """, [team_id]).fetchone()
    if not info:
        conn.close()
        return jsonify({'error': '未找到该团'}), 404
    rows = conn.execute("""
        SELECT snapshot_date,
               SUM(drive_task_count) AS drive,
               SUM(accompany_task_count) AS accompany,
               SUM(gift_task_count) AS gift
        FROM team_detail
        WHERE CAST(team_id AS TEXT) = ? AND rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id, snapshot_date)
        GROUP BY snapshot_date ORDER BY snapshot_date
    """, [team_id]).fetchall()
    conn.close()
    daily = [{
        'date': r['snapshot_date'],
        'drive': r['drive'] or 0,
        'accompany': r['accompany'] or 0,
        'gift': r['gift'] or 0,
        'total': (r['drive'] or 0) + (r['accompany'] or 0) + (r['gift'] or 0),
    } for r in rows]
    return jsonify({
        'team_id': info['team_id'],
        'hall_name': info['hall_name'],
        'sister_nickname': info['sister_nickname'],
        'sister_uid': info['sister_uid'],
        'days_since_formed': info['days_since_formed'],
        'status': 'active' if (not info['dissolve_date'] or info['dissolve_date'] == '') else 'dissolved',
        'daily': daily,
    })


@app.route('/api/warncenter')
@login_required
def api_warncenter():
    """预警中心：平台级预警 4 卡（留存率 / 主动解散占比 / 新成团数 / 解散时间分布）。
    前 3 卡返回近 8 周趋势 + 当前值 + 环比 + 触发判定 + 受影响厅 Top10；
    第 4 卡为解散时间分布分周直方图（近 8 周非毕业解散按存续天数分 4 桶）+ 受影响厅。"""
    conn = get_db_conn()
    ref = conn.execute('SELECT MAX(snapshot_date) AS ref FROM team_detail').fetchone()['ref']
    rows = week_rows_all(conn, limit=8)  # 全平台逐周重算（升序）

    def trend_of(key):
        return [{'week': r['week_label'], 'value': r[key]} for r in rows if r.get(key) is not None]

    cur = rows[-1] if rows else None
    prev = rows[-2] if len(rows) >= 2 else None
    cur_ws, cur_we = (cur['week_start'], cur['week_end']) if cur else (None, None)
    prev_ws, prev_we = (prev['week_start'], prev['week_end']) if prev else (None, None)

    # ---- 卡1：留存率（< 60% 健康线） ----
    ret_trend = trend_of('retention_rate')
    ret_cur = ret_trend[-1]['value'] if ret_trend else None
    ret_prev = ret_trend[-2]['value'] if len(ret_trend) >= 2 else None
    ret_wow = round(ret_cur - ret_prev, 2) if (ret_cur is not None and ret_prev is not None) else None
    ret_triggered = ret_cur is not None and ret_cur < 60
    ret_halls = []
    if cur_ws and prev_ws:
        cur_map = retention_by_hall(conn, cur_ws, cur_we)
        prev_map = retention_by_hall(conn, prev_ws, prev_we)
        ret_halls = sorted(
            ({'hall': h, 'current': v, 'wow': round(v - prev_map[h], 2) if h in prev_map else None}
             for h, v in cur_map.items() if v < 60),
            key=lambda x: x['current'])[:10]

    # ---- 卡2：主动解散占比（连续 2 周环比升高） ----
    ad_trend = trend_of('active_dissolved_pct')
    ad_cur = ad_trend[-1]['value'] if ad_trend else None
    ad_prev = ad_trend[-2]['value'] if len(ad_trend) >= 2 else None
    ad_prev2 = ad_trend[-3]['value'] if len(ad_trend) >= 3 else None
    ad_wow = round(ad_cur - ad_prev, 2) if (ad_cur is not None and ad_prev is not None) else None
    ad_triggered = (ad_cur is not None and ad_prev is not None and ad_prev2 is not None
                    and ad_cur > ad_prev > ad_prev2)
    ad_halls = []
    if cur_ws and prev_ws:
        def ad_map(ws, we):
            q = f"""SELECT hall_name,
                       COUNT(DISTINCT team_id) AS diss,
                       COUNT(DISTINCT CASE WHEN {ACTIVE_DISS_REASON_SQL} THEN team_id END) AS active_diss
                    FROM team_detail
                    WHERE dissolve_date >= ? AND dissolve_date <= ? AND dissolve_reason != '毕业'
                      AND hall_name IS NOT NULL AND hall_name != ''
                    GROUP BY hall_name"""
            m = {}
            for r in conn.execute(q, (ws, we)).fetchall():
                if r['diss']:
                    m[r['hall_name']] = round(r['active_diss'] / r['diss'] * 100, 2)
            return m
        ad_cur_map = ad_map(cur_ws, cur_we)
        ad_prev_map = ad_map(prev_ws, prev_we)
        ad_halls = sorted(
            ({'hall': h, 'current': v, 'wow': round(v - ad_prev_map[h], 2) if h in ad_prev_map else None}
             for h, v in ad_cur_map.items() if v > ad_prev_map.get(h, 0)),
            key=lambda x: -x['current'])[:10]

    # ---- 卡3：新成团数（连续 2 周环比下降） ----
    nt_trend = trend_of('new_team_count')
    nt_cur = nt_trend[-1]['value'] if nt_trend else None
    nt_prev = nt_trend[-2]['value'] if len(nt_trend) >= 2 else None
    nt_prev2 = nt_trend[-3]['value'] if len(nt_trend) >= 3 else None
    nt_wow = nt_cur - nt_prev if (nt_cur is not None and nt_prev is not None) else None
    nt_triggered = (nt_cur is not None and nt_prev is not None and nt_prev2 is not None
                    and nt_cur < nt_prev < nt_prev2)
    nt_halls = []
    if cur_ws and prev_ws:
        def nt_map(ws, we):
            m = {}
            for r in conn.execute("""SELECT hall_name, COUNT(DISTINCT team_id) AS n FROM team_detail
                                     WHERE form_date >= ? AND form_date <= ? AND hall_name IS NOT NULL AND hall_name != ''
                                     GROUP BY hall_name""", (ws, we)).fetchall():
                m[r['hall_name']] = r['n']
            return m
        nt_cur_map = nt_map(cur_ws, cur_we)
        nt_prev_map = nt_map(prev_ws, prev_we)
        nt_halls = sorted(
            ({'hall': h, 'current': v, 'wow': v - nt_prev_map[h] if h in nt_prev_map else None}
             for h, v in nt_cur_map.items() if v < nt_prev_map.get(h, 0)),
            key=lambda x: x['current'])[:10]

    # ---- 卡4：解散时间分布（非毕业解散按「成团→解散」存续天数分 4 桶） ----
    # 口径：已解散团存续天数 = dissolve_date − form_date（I 节同源）；非毕业解散 = dissolve_reason != '毕业'
    # 4 桶：第1周1-7天 / 第2周8-14天 / 第3周15-21天 / 第4周22-29天（22+ 并入第4周）
    diss_buckets = [('第1周(1-7天)', 1, 7), ('第2周(8-14天)', 8, 14),
                    ('第3周(15-21天)', 15, 21), ('第4周(22-29天)', 22, 10 ** 9)]
    diss_hist = [0] * len(diss_buckets)
    diss_halls = {}  # hall -> {'count': n, 'weeks': [..]}
    for r in conn.execute(f"""
        SELECT hall_name, MIN(form_date) AS form_date, MIN(dissolve_date) AS dissolve_date
        FROM team_detail
        WHERE dissolve_date IS NOT NULL AND dissolve_date != ''
          AND dissolve_reason != '毕业'
          AND form_date IS NOT NULL AND form_date != ''
          AND dissolve_date >= date(?, '-56 day')
        GROUP BY team_id
    """, (ref,)).fetchall():
        try:
            d = (datetime.strptime(r['dissolve_date'][:10], '%Y-%m-%d')
                 - datetime.strptime(r['form_date'][:10], '%Y-%m-%d')).days
        except Exception:
            continue
        if d <= 0:
            continue
        for i, (_, lo, hi) in enumerate(diss_buckets):
            if lo <= d <= hi:
                diss_hist[i] += 1
                h = r['hall_name']
                if h:
                    dh = diss_halls.setdefault(h, {'count': 0, 'weeks': [0] * len(diss_buckets)})
                    dh['count'] += 1
                    dh['weeks'][i] += 1
                break
    diss_affected = []
    for h, dh in diss_halls.items():
        peak_i = max(range(len(diss_buckets)), key=lambda i: dh['weeks'][i])
        diss_affected.append({'hall': h, 'count': dh['count'], 'peak_week': diss_buckets[peak_i][0]})
    diss_affected.sort(key=lambda x: -x['count'])
    diss_affected = diss_affected[:10]
    diss_total = sum(diss_hist)
    # 触发判定：第 2 周（8-14 天）为高发周（解散最集中的存续周）
    diss_triggered = diss_hist[1] > 0 and diss_hist[1] == max(diss_hist)
    conn.close()

    return jsonify({
        'ref_date': ref,
        'cards': [
            {'key': 'retention', 'title': '留存率预警', 'level': 'severe',
             'metric_note': '(期末进行中 − 本周新成团) ÷ 期初进行中；期初/期末 = 周内最早/最晚快照日', 'threshold': '< 60% 健康线',
             'trend': ret_trend, 'current': ret_cur, 'wow': ret_wow, 'triggered': ret_triggered,
             'affected_halls': ret_halls},
            {'key': 'active_diss', 'title': '主动解散占比预警', 'level': 'warning',
             'metric_note': '主动解散 ÷ 非毕业解散；主动 = 手动/离职(含换厅)/注销', 'threshold': '连续 2 周环比升高',
             'trend': ad_trend, 'current': ad_cur, 'wow': ad_wow, 'triggered': ad_triggered,
             'affected_halls': ad_halls},
            {'key': 'new_team', 'title': '新成团数预警', 'level': 'notice',
             'metric_note': 'form_date 落在本周的团计数', 'threshold': '连续 2 周环比下降',
             'trend': nt_trend, 'current': nt_cur, 'wow': nt_wow, 'triggered': nt_triggered,
             'affected_halls': nt_halls},
            {'key': 'dissolve_time', 'title': '解散时间分布', 'level': 'notice',
             'metric_note': '非毕业解散团「成团→解散」存续天数分 4 桶（近 8 周）', 'threshold': '第 2 周（8-14 天）高发',
             'hist': [{'label': b[0], 'count': c} for b, c in zip(diss_buckets, diss_hist)],
             'total': diss_total, 'triggered': diss_triggered,
             'affected_halls': diss_affected},
        ],
    })


@app.route('/api/alerts-center')
@login_required
def api_alerts_center():
    """预警中心：alerts 表历史记录（支持按严重级别/处理状态过滤）"""
    severity = request.args.get('severity', 'all')
    resolved = request.args.get('resolved', 'all')  # all / 0 / 1
    limit = min(int(request.args.get('limit', 100)), 500)
    conn = get_db_conn()
    conditions, params = [], []
    if severity != 'all':
        conditions.append('severity = ?')
        params.append(severity)
    if resolved in ('0', '1'):
        conditions.append('is_resolved = ?')
        params.append(int(resolved))
    where = ('WHERE ' + ' AND '.join(conditions)) if conditions else ''
    rows = conn.execute(
        f'SELECT * FROM alerts {where} ORDER BY created_at DESC, id DESC LIMIT ?', params + [limit]
    ).fetchall()
    unresolved = conn.execute('SELECT COUNT(*) AS c FROM alerts WHERE is_resolved = 0').fetchone()['c']
    conn.close()
    return jsonify({'data': [dict(r) for r in rows], 'unresolved': unresolved})


@app.route('/api/alerts/<int:alert_id>/resolve', methods=['POST'])
@login_required
def api_alert_resolve(alert_id):
    """标记预警为已处理/未处理"""
    body = request.get_json(silent=True) or {}
    resolved = 1 if body.get('resolved', True) else 0
    conn = get_db_conn()
    conn.execute('UPDATE alerts SET is_resolved = ? WHERE id = ?', (resolved, alert_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/daily-retention')
@login_required
def api_daily_retention():
    """返回近N周的周级留存率/解散率/新成团数（基于 team_detail 重算）"""
    weeks = int(request.args.get('weeks', 10))
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    week_items = week_list_from_detail(conn, limit=weeks)
    rows = []
    for ws, we in week_items:
        m = week_metrics_from_detail(conn, hall, ws, we)
        if m:
            rows.append(m)
    conn.close()

    rows = list(reversed(rows))
    dates = [r['week_label'] for r in rows]
    retention = [round(r['retention_rate'] or 0, 1) for r in rows]
    dissolution = [round(r['dissolution_rate'] or 0, 1) for r in rows]
    new_teams = [r['new_team_count'] or 0 for r in rows]

    return jsonify({'dates': dates, 'retention': retention, 'dissolution': dissolution, 'new_teams': new_teams})

@app.route('/api/weekly-report')
@login_required
def api_weekly_report():
    """周报趋势：基于 team_detail 逐周重算（口径定稿 2026-08-17），替换 weekly_report 表直读"""
    limit = request.args.get('limit', 'all')
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    weeks = week_list_from_detail(conn, limit=int(limit) if limit != 'all' else 0)
    rows = []
    for ws, we in weeks:
        m = week_metrics_from_detail(conn, hall, ws, we)
        if m:
            # 官方发放奖励仅全平台有，补进返回行（供对比页等字段兼容）
            if hall == 'all':
                m['total_reward'] = stats_daily_dedup_reward(conn, ws, we)
            else:
                m['total_reward'] = m['weekly_revenue']
            rows.append(m)
    conn.close()
    return jsonify({'data': rows})
@app.route('/api/detail-table')
@login_required
def api_detail_table():
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    search = request.args.get('search', '')
    hall = request.args.get('hall', 'all')
    status = request.args.get('status', 'all')
    reason = request.args.get('reason', '')
    days_min = request.args.get('days_min', '')
    days_max = request.args.get('days_max', '')
    date_field = request.args.get('date_field', '')
    date_min = request.args.get('date_min', '')
    date_max = request.args.get('date_max', '')
    sort_field = request.args.get('sort_field', 'team_id')
    sort_order = request.args.get('sort_order', 'asc')
    
    # 允许的排序字段白名单
    allowed_fields = ['team_id', 'form_date', 'hall_name', 'days_since_formed', 
                      'sister_revenue', 'reward_amount', 'dissolve_date']
    if sort_field not in allowed_fields:
        sort_field = 'team_id'
    order_sql = 'ASC' if sort_order == 'asc' else 'DESC'
    
    conn = get_db_conn()
    
    conditions = []
    params = []
    # 只显示最新快照的数据，避免历史快照重复；同一快照内按 team_id 去重（防御重复抓取）
    conditions.append('''rowid IN (SELECT MAX(rowid) FROM team_detail
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail) GROUP BY team_id)''')
    if search:
        conditions.append('(sister_nickname LIKE ? OR sister_nickname2 LIKE ? OR CAST(team_id AS TEXT) LIKE ? OR hall_name LIKE ? OR dissolve_reason LIKE ?)')
        params = [f'%{search}%', f'%{search}%', f'%{search}%', f'%{search}%', f'%{search}%']
    if hall != 'all':
        conditions.append('hall_name = ?')
        params.append(hall)
    if status == 'active':
        conditions.append("(dissolve_date = '' OR dissolve_date IS NULL)")
    elif status == 'dissolved':
        conditions.append("dissolve_date != '' AND dissolve_date IS NOT NULL")
    if reason:
        conditions.append(f'({DISSOLVE_REASON_CASE}) = ?')
        params.append(reason)
    if days_min != '':
        conditions.append('days_since_formed >= ?')
        params.append(int(days_min))
    if days_max != '':
        conditions.append('days_since_formed <= ?')
        params.append(int(days_max))
    if date_field in ('form_date', 'dissolve_date') and (date_min or date_max):
        if date_min:
            conditions.append(f'date({date_field}) >= ?')
            params.append(date_min)
        if date_max:
            conditions.append(f'date({date_field}) <= ?')
            params.append(date_max)

    where_clause = 'WHERE ' + ' AND '.join(conditions) if conditions else ''
    
    cursor = conn.execute(f'SELECT COUNT(*) as total FROM team_detail {where_clause}', params)
    total = cursor.fetchone()['total']
    
    offset = (page - 1) * per_page
    cursor = conn.execute(f'SELECT * FROM team_detail {where_clause} ORDER BY {sort_field} {order_sql} LIMIT ? OFFSET ?', params + [per_page, offset])
    rows = cursor.fetchall()
    conn.close()

    # 已成团天数口径：已解散团用 dissolve_date − form_date 覆盖（2026-08-31，对齐 I 节）
    for row in rows:
        dd = (row.get('dissolve_date') or '').strip()
        fd = (row.get('form_date') or '').strip()
        if dd and fd:
            try:
                row['days_since_formed'] = (datetime.strptime(dd[:10], '%Y-%m-%d')
                                            - datetime.strptime(fd[:10], '%Y-%m-%d')).days
            except Exception:
                pass

    return jsonify({
        'data': rows,
        'total': total,
        'page': page,
        'per_page': per_page
    })

@app.route('/api/weekly-team-detail')
@login_required
def api_weekly_team_detail():
    """趋势点下钻：某厅某周的团明细（新成团 / 该周解散+原因 / 周存活数）。
    口径与 metrics.py 一致：成团归周看 form_date，解散归周看 dissolve_date。
    """
    hall = request.args.get('hall', '')
    week_start = request.args.get('week_start', '')
    week_end = request.args.get('week_end', '')
    if not hall or not week_start or not week_end:
        return jsonify({'error': 'hall/week_start/week_end required'}), 400

    conn = get_db_conn()
    latest_teams = 'rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)'

    new_teams = conn.execute(
        f"SELECT team_id, sister_nickname, sister_uid, sister_level, hall_name, form_date "
        f"FROM team_detail WHERE {latest_teams} AND hall_name = ? AND date(form_date) BETWEEN ? AND ? "
        f"ORDER BY form_date",
        (hall, week_start, week_end)).fetchall()

    dissolved_teams = conn.execute(
        f"SELECT team_id, sister_nickname, sister_uid, hall_name, form_date, dissolve_date, "
        f"{DISSOLVE_REASON_CASE} AS reason "
        f"FROM team_detail WHERE {latest_teams} AND hall_name = ? AND date(dissolve_date) BETWEEN ? AND ? "
        f"ORDER BY dissolve_date",
        (hall, week_start, week_end)).fetchall()

    active_end = conn.execute(
        f"SELECT COUNT(*) AS c FROM team_detail WHERE {latest_teams} AND hall_name = ? "
        f"AND date(form_date) <= ? AND (dissolve_date = '' OR dissolve_date IS NULL OR date(dissolve_date) > ?)",
        (hall, week_end, week_end)).fetchone()['c']

    conn.close()
    return jsonify({
        'hall_name': hall,
        'week_start': week_start,
        'week_end': week_end,
        'new_teams': new_teams,
        'dissolved_teams': dissolved_teams,
        'active_end': active_end,
    })

@app.route('/api/hall-stats')
@login_required
def api_hall_stats():
    limit = int(request.args.get('limit', 10))
    hall = request.args.get('hall', '')

    user_uid = request.cookies.get('auth_uid')
    conn = get_db_conn()
    # 厅排行流水改「周增量」（B 节）：按所选周（缺省最新周）重算期末−期初快照流水
    week = request.args.get('week', '')
    if week and '|' in week:
        ws, we = week.split('|')[0], week.split('|')[1]
    else:
        wl = week_list_from_detail(conn, 1)
        ws, we = wl[0] if wl else (None, None)
    rev_map = hall_weekly_revenue(conn, ws, we) if ws else {}

    cursor = conn.execute('SELECT role FROM users WHERE uid = ?', (user_uid,))
    user = cursor.fetchone()
    role = user['role'] if user else 'admin'

    if role == 'admin' or hall == 'all':
        # 管理员或显式请求所有大厅
        cursor = conn.execute(
            "SELECT hall_name, team_count, active_count, dissolved_count, total_revenue "
            "FROM hall_stats "
            "WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM hall_stats) "
            "ORDER BY team_count DESC LIMIT ?",
            (limit,)
        )
    else:
        # 厅运营：只返回管理的厅
        managed = [r['hall_name'] for r in conn.execute(
            'SELECT hall_name FROM hall_managers WHERE uid = ?', (user_uid,)
        ).fetchall()]
        if managed:
            placeholders = ','.join('?' * len(managed))
            cursor = conn.execute(
                f"SELECT hall_name, team_count, active_count, dissolved_count, total_revenue "
                f"FROM hall_stats "
                f"WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM hall_stats) "
                f"AND hall_name IN ({placeholders}) "
                f"ORDER BY team_count DESC",
                tuple(managed)
            )
        else:
            cursor = conn.execute(
                "SELECT hall_name, team_count, active_count, dissolved_count, total_revenue "
                "FROM hall_stats WHERE 1=0"
            )
    
    rows = cursor.fetchall()
    conn.close()

    # 覆盖流水为周增量（B 节）；计数列仍用 hall_stats 快照口径
    for r in rows:
        r['total_revenue'] = rev_map.get(r['hall_name'], 0)

    return jsonify({'data': rows})


@app.route('/api/alerts')
@login_required
def api_alerts():
    """动态生成预警列表，支持按指定周或最近3周对比（基于 team_detail 重算）"""
    week = request.args.get('week', '')
    conn = get_db_conn()
    all_rows = week_rows_all(conn)
    if not all_rows:
        conn.close()
        return jsonify({'data': []})
    if week and '|' in week:
        ws, _ = week.split('|')
        this_week = next((r for r in all_rows if r['week_start'] == ws), None)
        if not this_week:
            conn.close()
            return jsonify({'data': []})
        # 前两周（新→旧），用于环比和连续趋势
        older = [r for r in all_rows if r['week_start'] < ws]
        prev_rows = older[-2:][::-1]
        rows = [this_week] + prev_rows
    else:
        rows = all_rows[-3:][::-1]
    conn.close()

    alerts = []
    if len(rows) < 2:
        return jsonify({'data': alerts})

    this_week = rows[0]
    last_week = rows[1]
    week_label = this_week['week_label']
    
    # 环比计算
    new_team_change = 0
    if last_week['new_team_count'] and last_week['new_team_count'] > 0:
        new_team_change = (this_week['new_team_count'] - last_week['new_team_count']) / last_week['new_team_count'] * 100
    
    diss_change = 0
    if last_week['dissolved_count'] and last_week['dissolved_count'] > 0:
        diss_change = (this_week['dissolved_count'] - last_week['dissolved_count']) / last_week['dissolved_count'] * 100
    
    revenue_change = 0
    if last_week['total_reward'] and last_week['total_reward'] > 0:
        revenue_change = (this_week['total_reward'] - last_week['total_reward']) / last_week['total_reward'] * 100
    
    # 1. 新成团数骤降 (>30%)
    if new_team_change < -30:
        alerts.append({
            'severity': 'high',
            'title': '新成团数骤降',
            'message': f'本周新成团{this_week["new_team_count"]}个，环比下降{abs(new_team_change):.1f}%',
            'metric_value': f'{this_week["new_team_count"]}个',
            'week_label': week_label,
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        })
    
    # 2. 解散数突增 (>20%)
    if diss_change > 20:
        alerts.append({
            'severity': 'high',
            'title': '解散率突增',
            'message': f'本周解散{this_week["dissolved_count"]}个，环比上升{diss_change:.1f}%',
            'metric_value': f'{this_week["dissolved_count"]}个',
            'week_label': week_label,
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        })
    
    # 3. 流水大幅下降 (>25%)
    if revenue_change < -25:
        alerts.append({
            'severity': 'high',
            'title': '流水大幅下降',
            'message': f'本周流水¥{this_week["total_reward"]:.0f}，环比下降{abs(revenue_change):.1f}%',
            'metric_value': f'¥{this_week["total_reward"]:.0f}',
            'week_label': week_label,
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        })
    
    # 4. 新成团数连续下降（需要3周数据）
    if len(rows) >= 3:
        week3 = rows[2]
        if this_week['new_team_count'] < last_week['new_team_count'] < week3['new_team_count']:
            alerts.append({
                'severity': 'medium',
                'title': '新成团数连续下降',
                'message': f'连续2周下降：{week3["new_team_count"]} → {last_week["new_team_count"]} → {this_week["new_team_count"]}',
                'metric_value': f'{this_week["new_team_count"]}个',
                'week_label': week_label,
                'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            })
    
    # 5. 解散率连续上升（需要3周数据）
    if len(rows) >= 3:
        week3 = rows[2]
        if this_week['dissolution_rate'] > last_week['dissolution_rate'] > week3['dissolution_rate']:
            alerts.append({
                'severity': 'medium',
                'title': '解散率连续上升',
                'message': f'连续2周上升：{week3["dissolution_rate"]:.1f}% → {last_week["dissolution_rate"]:.1f}% → {this_week["dissolution_rate"]:.1f}%',
                'metric_value': f'{this_week["dissolution_rate"]:.1f}%',
                'week_label': week_label,
                'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            })
    
    # 无预警时显示正常
    if not alerts:
        alerts.append({
            'severity': 'low',
            'title': '本周运营正常',
            'message': '核心指标无异常波动',
            'metric_value': '—',
            'week_label': week_label,
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        })
    
    return jsonify({'data': alerts})

@app.route('/api/export/weekly')
@login_required
def api_export_weekly():
    conn = get_db_conn()
    rows = week_rows_all(conn)
    conn.close()

    import io, csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['周标签', '开始日期', '结束日期', '新成团数', '进行中团数', '解散数', '留存率(%)', '解散率(%)', '礼物奖励金额(元)', '活跃度'])
    for r in rows:
        writer.writerow([r['week_label'], r['week_start'], r['week_end'], r['new_team_count'],
                         r['active_team_count_end'], r['dissolved_count'], r['retention_rate'],
                         r['dissolution_rate'], r['total_reward'], r['activity_index']])
    
    csv_bytes = output.getvalue().encode('utf-8-sig')
    return Response(csv_bytes, mimetype='text/csv; charset=utf-8-sig',
                    headers={'Content-Disposition': 'attachment; filename=weekly_report.csv'})


@app.route('/api/export/pdf-report')
@login_required
def api_export_pdf_report():
    """导出周报概览+核心趋势+预警PDF报表"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.graphics.shapes import Drawing, Line, String, Rect
    from reportlab.graphics.charts.linecharts import HorizontalLineChart
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics import renderPDF
    import io, os
    
    week = request.args.get('week', '')
    conn = get_db_conn()
    all_rows = week_rows_all(conn)
    conn.close()

    # 查询周报数据（基于 team_detail 重算）
    if week and '|' in week:
        ws, _ = week.split('|')
        week_row = next((r for r in all_rows if r['week_start'] == ws), None)
        older = [r for r in all_rows if r['week_start'] < ws]
        prev_row = older[-1] if older else None
        week3_row = older[-2] if len(older) > 1 else None
    else:
        week_row = all_rows[-1] if all_rows else None
        prev_row = all_rows[-2] if len(all_rows) > 1 else None
        week3_row = all_rows[-3] if len(all_rows) > 2 else None

    # 近12周趋势数据（用于图表，从早到晚）
    trend_rows = all_rows[-12:]

    # PDF生成
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            rightMargin=40, leftMargin=40,
                            topMargin=40, bottomMargin=30)
    styles = getSampleStyleSheet()
    story = []
    
    # 注册中文字体
    font_name = 'Helvetica'
    for fp, subidx in [('C:/Windows/Fonts/simhei.ttf', None), ('C:/Windows/Fonts/msyh.ttc', 0), ('C:/Windows/Fonts/simsun.ttc', 0)]:
        if os.path.exists(fp):
            try:
                if subidx is not None:
                    pdfmetrics.registerFont(TTFont('CN', fp, subfontIndex=subidx))
                else:
                    pdfmetrics.registerFont(TTFont('CN', fp))
                font_name = 'CN'
                break
            except Exception:
                pass
    
    # 设置所有样式字体
    for style_name in ['Heading1', 'Heading2', 'Heading3', 'Normal', 'BodyText']:
        if style_name in styles:
            styles[style_name].fontName = font_name
    
    # ===== 标题区 =====
    title_style = styles['Heading1']
    story.append(Paragraph('姐妹团数据统计报表', title_style))
    if week_row:
        story.append(Paragraph(f"统计周期：{week_row['week_start']} ~ {week_row['week_end']} ({week_row['week_label']})", styles['Normal']))
    story.append(Paragraph(f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    story.append(Spacer(1, 12))
    
    # ===== 一、KPI概览 =====
    story.append(Paragraph('一、周报概览（KPI）', styles['Heading2']))
    if week_row:
        def calc_pct(curr, prev):
            if not prev or prev == 0: return '—'
            return f"{round((curr - prev) / prev * 100, 1)}%"
        
        # 使用修正后的留存率公式
        def calc_retention(row):
            if not row: return 0
            start = row.get('active_team_count_start', 0) or 0
            end = row.get('active_team_count_end', 0) or 0
            new = row.get('new_team_count', 0) or 0
            if start <= 0: return 0
            return min(100, round((end - new) / start * 100, 2))
        
        this_ret = calc_retention(week_row)
        prev_ret = calc_retention(prev_row)
        
        kpi_data = [
            ['指标', '本周值', '上周值', '环比变化'],
            ['新成团数', week_row['new_team_count'], prev_row['new_team_count'] if prev_row else '—', calc_pct(week_row['new_team_count'], prev_row['new_team_count'] if prev_row else None)],
            ['进行中姐妹团', week_row['active_team_count_end'], prev_row['active_team_count_end'] if prev_row else '—', calc_pct(week_row['active_team_count_end'], prev_row['active_team_count_end'] if prev_row else None)],
            ['留存率(%)', this_ret, prev_ret if prev_row else '—', f"{round(this_ret - prev_ret, 1)}%" if prev_row else '—'],
            ['解散率(%)', week_row['dissolution_rate'], prev_row['dissolution_rate'] if prev_row else '—', calc_pct(week_row['dissolution_rate'], prev_row['dissolution_rate'] if prev_row else None)],
            ['礼物奖励金额(元)', round(week_row['total_reward'], 1), round(prev_row['total_reward'], 1) if prev_row else '—', calc_pct(week_row['total_reward'], prev_row['total_reward'] if prev_row else None)],
            ['活跃度', week_row['activity_index'], prev_row['activity_index'] if prev_row else '—', calc_pct(week_row['activity_index'], prev_row['activity_index'] if prev_row else None)],
        ]
        table = Table(kpi_data, colWidths=[110, 90, 90, 90])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, -1), font_name),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
        ]))
        story.append(table)
    story.append(Spacer(1, 16))
    
    # ===== 二、本周预警 =====
    story.append(Paragraph('二、本周预警', styles['Heading2']))
    if week_row and prev_row:
        alerts = []
        nt_change = 0
        if prev_row['new_team_count'] and prev_row['new_team_count'] > 0:
            nt_change = (week_row['new_team_count'] - prev_row['new_team_count']) / prev_row['new_team_count'] * 100
        diss_change = 0
        if prev_row['dissolved_count'] and prev_row['dissolved_count'] > 0:
            diss_change = (week_row['dissolved_count'] - prev_row['dissolved_count']) / prev_row['dissolved_count'] * 100
        rev_change = 0
        if prev_row['total_reward'] and prev_row['total_reward'] > 0:
            rev_change = (week_row['total_reward'] - prev_row['total_reward']) / prev_row['total_reward'] * 100
        
        if nt_change < -30:
            alerts.append(['🔴 高', '新成团数骤降', f"本周新成团{week_row['new_team_count']}个，环比下降{abs(nt_change):.1f}%"])
        if diss_change > 20:
            alerts.append(['🔴 高', '解散率突增', f"本周解散{week_row['dissolved_count']}个，环比上升{diss_change:.1f}%"])
        if rev_change < -25:
            alerts.append(['🔴 高', '流水大幅下降', f"本周流水¥{week_row['total_reward']:.0f}，环比下降{abs(rev_change):.1f}%"])
        if week3_row:
            if week_row['new_team_count'] < prev_row['new_team_count'] < week3_row['new_team_count']:
                alerts.append(['🟡 中', '新成团数连续下降', f"连续2周下降：{week3_row['new_team_count']} → {prev_row['new_team_count']} → {week_row['new_team_count']}"])
            if week_row['dissolution_rate'] > prev_row['dissolution_rate'] > week3_row['dissolution_rate']:
                alerts.append(['🟡 中', '解散率连续上升', f"连续2周上升：{week3_row['dissolution_rate']:.1f}% → {prev_row['dissolution_rate']:.1f}% → {week_row['dissolution_rate']:.1f}%"])
        if not alerts:
            alerts.append(['🟢 低', '本周运营正常', '核心指标无异常波动'])
        
        alert_data = [['严重程度', '预警项', '详情']]
        for a in alerts:
            alert_data.append(a)
        table = Table(alert_data, colWidths=[60, 110, 260])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#ff4d4f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), font_name),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(table)
    story.append(Spacer(1, 16))
    
    # ===== 三、趋势图表 =====
    if len(trend_rows) >= 2:
        story.append(Paragraph('三、核心趋势图表', styles['Heading2']))
        
        # 1. 新成团数趋势图（柱状图）
        story.append(Paragraph('1. 新成团数趋势', styles['Heading3']))
        labels = [r['week_label'] for r in trend_rows]
        values = [r['new_team_count'] for r in trend_rows]
        
        drawing = Drawing(460, 160)
        bc = VerticalBarChart()
        bc.x = 40
        bc.y = 30
        bc.height = 110
        bc.width = 380
        bc.data = [values]
        bc.categoryAxis.categoryNames = labels
        bc.categoryAxis.labels.fontName = font_name
        bc.categoryAxis.labels.fontSize = 7
        bc.valueAxis.valueMin = 0
        bc.bars[0].fillColor = colors.HexColor('#667eea')
        drawing.add(bc)
        story.append(drawing)
        story.append(Spacer(1, 8))
        
        # 2. 留存率 & 解散率趋势图（双折线）
        story.append(Paragraph('2. 留存率 & 解散率趋势', styles['Heading3']))
        ret_values = [r['retention_rate'] for r in trend_rows]
        diss_values = [r['dissolution_rate'] for r in trend_rows]
        
        drawing2 = Drawing(460, 160)
        lc = HorizontalLineChart()
        lc.x = 40
        lc.y = 30
        lc.height = 110
        lc.width = 380
        lc.data = [ret_values, diss_values]
        lc.categoryAxis.categoryNames = labels
        lc.categoryAxis.labels.fontName = font_name
        lc.categoryAxis.labels.fontSize = 7
        lc.lines[0].strokeColor = colors.HexColor('#52c41a')
        lc.lines[1].strokeColor = colors.HexColor('#ff4d4f')
        drawing2.add(lc)
        story.append(drawing2)
        story.append(Spacer(1, 8))
        
        # 3. 礼物奖励金额趋势图（柱状图）
        story.append(Paragraph('3. 礼物奖励金额趋势', styles['Heading3']))
        rev_values = [round(r['total_reward'], 1) for r in trend_rows]
        
        drawing3 = Drawing(460, 160)
        bc2 = VerticalBarChart()
        bc2.x = 40
        bc2.y = 30
        bc2.height = 110
        bc2.width = 380
        bc2.data = [rev_values]
        bc2.categoryAxis.categoryNames = labels
        bc2.categoryAxis.labels.fontName = font_name
        bc2.categoryAxis.labels.fontSize = 7
        bc2.valueAxis.valueMin = 0
        bc2.bars[0].fillColor = colors.HexColor('#faad14')
        drawing3.add(bc2)
        story.append(drawing3)
        story.append(Spacer(1, 8))
    
    # ===== 四、核心趋势明细表 =====
    story.append(Paragraph('四、核心趋势明细（近12周）', styles['Heading2']))
    if trend_rows:
        trend_data = [['周期', '新成团', '进行中', '解散', '留存率%', '解散率%', '礼物奖励金额', '活跃度']]
        for r in trend_rows:
            trend_data.append([r['week_label'], r['new_team_count'], r['active_team_count_end'], r['dissolved_count'],
                               r['retention_rate'], r['dissolution_rate'], round(r['total_reward'], 1), r['activity_index']])
        table = Table(trend_data)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, -1), font_name),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
        ]))
        story.append(table)
    
    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()
    return Response(pdf_bytes, mimetype='application/pdf',
                    headers={'Content-Disposition': 'attachment; filename=sister_report.pdf'})
@app.route('/api/export/detail')
@login_required
def api_export_detail():
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    where = ''
    params = []
    if hall != 'all':
        where = 'WHERE hall_name = ?'
        params = [hall]
    cursor = conn.execute(f'''
        SELECT team_id, form_date, hall_name, sister_nickname, sister_uid,
               sister_nickname2, sister_uid2, sister_revenue, reward_amount, dissolve_date
        FROM team_detail {where} ORDER BY snapshot_date DESC, team_id DESC
    ''', params)
    rows = cursor.fetchall()
    conn.close()
    
    import io, csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['姐妹团ID', '成团日期', '大厅', '姐姐昵称', '姐姐UID', '妹妹昵称', '妹妹UID', '累计流水', '奖励金额', '解散日期'])
    for r in rows:
        writer.writerow([r['team_id'], r['form_date'], r['hall_name'], r['sister_nickname'],
                         r['sister_uid'], r['sister_nickname2'], r['sister_uid2'],
                         r['sister_revenue'], r['reward_amount'], r['dissolve_date']])
    
    csv_bytes = output.getvalue().encode('utf-8-sig')
    return Response(csv_bytes, mimetype='text/csv; charset=utf-8-sig',
                    headers={'Content-Disposition': 'attachment; filename=team_detail.csv'})


# ═══════════════════════════════════════════════════════
#  UID 查询接口
# ═══════════════════════════════════════════════════════

def _get_team_info_by_uid(uid: str, team_id: str = None) -> dict:
    """从 team_detail 表查询 UID 所在的姐妹团信息
    team_id: 如果提供了 team_id，则精确匹配该团
    """
    try:
        conn = get_db_conn()
        if team_id:
            # 精确匹配团ID（从明细表跳转时使用）
            cursor = conn.execute('''
                SELECT team_id, form_date, hall_name,
                       sister_nickname, sister_uid,
                       sister_nickname2, sister_uid2,
                       sister_revenue, reward_amount, dissolve_date
                FROM team_detail
                WHERE team_id = ?
                  AND snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                LIMIT 1
            ''', (team_id,))
        else:
            # 模糊匹配：返回最新快照中包含该UID的团
            cursor = conn.execute('''
                SELECT team_id, form_date, hall_name,
                       sister_nickname, sister_uid,
                       sister_nickname2, sister_uid2,
                       sister_revenue, reward_amount, dissolve_date
                FROM team_detail
                WHERE (sister_uid = ? OR sister_uid2 = ?)
                  AND snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                ORDER BY form_date DESC LIMIT 1
            ''', (uid, uid))
        row = cursor.fetchone()
        conn.close()
        if row:
            return {
                'team_id': row['team_id'],
                'hall_name': row['hall_name'],
                'form_date': row['form_date'],
                'sister_nickname': row['sister_nickname'],
                'sister_uid': row['sister_uid'],
                'sister_nickname2': row['sister_nickname2'],
                'sister_uid2': row['sister_uid2'],
                'total_revenue': row['sister_revenue'],
                'reward_amount': row['reward_amount'],
                'status': '已解散' if row['dissolve_date'] else '进行中',
                'dissolve_date': row['dissolve_date'],
            }
    except Exception as e:
        print(f'[WARN] 查询姐妹团明细失败: {e}')
    return None


def _get_bound_sisters(uid: str) -> list:
    """
    获取某UID作为姐姐时绑定的所有妹妹。
    一个姐姐可能同时绑定多个妹妹（多对姐妹团）。
    """
    try:
        conn = get_db_conn()
        cursor = conn.execute('''
            SELECT team_id, form_date, hall_name,
                   sister_nickname, sister_uid,
                   sister_nickname2, sister_uid2,
                   sister_revenue, reward_amount, dissolve_date
            FROM team_detail
            WHERE sister_uid = ?
              AND snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
              AND (dissolve_date = '' OR dissolve_date IS NULL)
            ORDER BY form_date DESC
        ''', (uid,))
        rows = cursor.fetchall()
        conn.close()
        sisters = []
        seen_uids = set()
        for row in rows:
            sister_uid2 = row['sister_uid2']
            if not sister_uid2 or sister_uid2 in seen_uids:
                continue
            seen_uids.add(sister_uid2)
            sisters.append({
                'team_id': row['team_id'],
                'hall_name': row['hall_name'],
                'form_date': row['form_date'],
                'sister_nickname': row['sister_nickname'],
                'sister_uid': row['sister_uid'],
                'sister_nickname2': row['sister_nickname2'],
                'sister_uid2': row['sister_uid2'],
                'total_revenue': row['sister_revenue'],
                'reward_amount': row['reward_amount'],
                'status': '已解散' if row['dissolve_date'] else '进行中',
                'dissolve_date': row['dissolve_date'],
            })
        return sisters
    except Exception as e:
        print(f'[WARN] 查询绑定妹妹失败: {e}')
    return []


@app.route('/api/uid-query', methods=['POST'])
@login_required
def api_uid_query():
    """
    UID查询 + 本周vs上周对比 + 姐妹团参与明细
    请求体: { uid: string, captain_type?: string }
    返回: { uid, nickname, this_week, last_week, compare, team_info? }
    """
    body = request.get_json() or {}
    uid = str(body.get('uid', '')).strip()
    captain_type = body.get('captain_type', 'game')

    if not uid:
        return jsonify({'error': 'UID不能为空'}), 400

    # 先查询本地姐妹团信息（用于用团总流水覆盖个人累计流水）
    team_id = body.get('team_id')
    team_info = _get_team_info_by_uid(uid, team_id)

    # 真实查询模式（需要内网连接 + 有效Cookie）
    if not _uid_crawler_available:
        return jsonify({
            'error': 'UID爬虫模块未加载，请检查 crawler/uid_crawler.py 是否存在'
        }), 500

    try:
        crawler = UIDCrawler()
        result = crawler.query_with_compare(uid, captain_type)
    except Exception as e:
        error_msg = str(e)
        if 'Cookie' in error_msg or '过期' in error_msg:
            return jsonify({
                'error': error_msg,
                'hint': '请在页面右上角「Cookie 管理」中更新 UID 查询 Cookie（保存后立即生效，无需重启）'
            }), 503
        if '无法连接' in error_msg or 'ConnectionError' in error_msg:
            return jsonify({
                'error': error_msg,
                'hint': '请确认已连接内网/VPN'
            }), 503
        return jsonify({'error': error_msg}), 500

    # 附加姐妹团信息
    if team_info:
        result['team_info'] = team_info

    # 查询绑定的妹妹（如果该UID是姐姐）
    bound_teams = _get_bound_sisters(uid)
    if bound_teams:
        result['bound_sisters'] = []
        for team in bound_teams:
            sister_uid = team.get('sister_uid2')
            sister_nickname = team.get('sister_nickname2', '')
            if not sister_uid:
                continue
            # 尝试查询妹妹的 UID 数据
            sister_data = None
            if _uid_crawler_available:
                try:
                    c = UIDCrawler()
                    sister_data = c.query_with_compare(str(sister_uid), captain_type)
                except Exception as e:
                    print(f'[WARN] 查询妹妹UID {sister_uid} 失败: {e}')
            result['bound_sisters'].append({
                'uid': sister_uid,
                'nickname': sister_nickname,
                'team_info': team,
                'uid_data': sister_data,
            })

    # 计算姐妹团累计流水 = 姐姐累计 + 所有绑定妹妹累计（数据来源 server1.tuwan.com:10010）
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
        if captain_uid and str(captain_uid) not in crawled_uids and _uid_crawler_available:
            try:
                c = UIDCrawler()
                captain_data = c.query_with_compare(str(captain_uid), captain_type)
                if captain_data.get('this_week', {}).get('data', {}).get('total_revenue'):
                    team_total_revenue += float(captain_data['this_week']['data']['total_revenue'])
                    print(f'[UID-API] 妹妹视角: 追加姐姐UID {captain_uid} 累计流水')
            except Exception as e:
                print(f'[WARN] 查询姐姐UID {captain_uid} 失败: {e}')

    result['team_total_revenue'] = round(team_total_revenue, 2)

    return jsonify(result)
@app.route('/api/uid-query/types')
@login_required
def api_uid_types():
    """返回支持的UID查询类型分类"""
    return jsonify({'types': [
        {'key': 'game', 'label': '新队长-游戏'},
        {'key': 'karaoke', 'label': '新队长-歌房'},
        {'key': 'werewolf', 'label': '新队长-狼人杀'},
        {'key': 'live', 'label': '实时-乐园杀'},
    ]})


# ═══════════════════════════════════════════════════════
#  登录鉴权接口
# ═══════════════════════════════════════════════════════

def generate_captcha_code(length=4):
    """生成随机字母验证码"""
    letters = string.ascii_uppercase + string.digits
    return ''.join(random.choices(letters, k=length))

def generate_captcha_image(code):
    """生成验证码图片，返回 base64 字符串"""
    width, height = 120, 44
    img = Image.new('RGB', (width, height), color=(31, 31, 31))
    draw = ImageDraw.Draw(img)

    # 绘制干扰线
    for _ in range(5):
        x1, y1 = random.randint(0, width), random.randint(0, height)
        x2, y2 = random.randint(0, width), random.randint(0, height)
        draw.line([(x1, y1), (x2, y2)], fill=(80, 80, 80), width=1)

    # 绘制干扰点
    for _ in range(30):
        x, y = random.randint(0, width), random.randint(0, height)
        draw.point((x, y), fill=(100, 100, 100))

    # 绘制文字
    font_paths = [
        'C:/Windows/Fonts/arialbd.ttf',
        'C:/Windows/Fonts/arial.ttf',
    ]
    font = None
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, 26)
                break
            except Exception:
                pass
    if font is None:
        font = ImageFont.load_default()

    # 每个字符 slightly different position
    for i, ch in enumerate(code):
        x = 15 + i * 24 + random.randint(-3, 3)
        y = 8 + random.randint(-4, 4)
        # 随机颜色（亮色）
        color = random.choice([
            (167, 139, 250),  # 紫
            (96, 165, 250),   # 蓝
            (250, 204, 21),   # 黄
            (251, 146, 60),   # 橙
        ])
        draw.text((x, y), ch, font=font, fill=color)

    # 输出 base64
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('utf-8')


@app.route('/api/captcha', methods=['GET'])
def api_captcha():
    """获取验证码图片"""
    code = generate_captcha_code(4)
    session['captcha_code'] = code
    session.permanent = True
    img_b64 = generate_captcha_image(code)
    return jsonify({
        'image': f'data:image/png;base64,{img_b64}',
        'length': len(code)
    })


@app.route('/api/login', methods=['POST'])
def api_login():
    """登录：验证 UID 白名单 + 验证码"""
    body = request.get_json() or {}
    uid = str(body.get('uid', '')).strip()
    captcha = str(body.get('captcha', '')).strip().upper()

    if not uid:
        return jsonify({'error': 'UID 不能为空'}), 400
    if not captcha:
        return jsonify({'error': '验证码不能为空'}), 400

    # 验证码校验（不区分大小写）
    expected = (session.get('captcha_code') or '').upper()
    if not expected or captcha != expected:
        return jsonify({'error': '验证码错误'}), 401

    # 白名单校验
    conn = get_db_conn()
    cursor = conn.execute('SELECT uid, nickname, role FROM users WHERE uid = ?', (uid,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({'error': '该 UID 不在白名单中，请联系管理员添加'}), 403

    # 设置 Cookie，7 天有效期
    resp = jsonify({
        'success': True,
        'uid': user['uid'],
        'nickname': user['nickname'],
        'role': user['role']
    })
    expires = datetime.now() + timedelta(days=7)
    resp.set_cookie(
        'auth_uid', user['uid'],
        expires=expires,
        httponly=True,
        samesite='Lax',
        path='/'
    )
    return resp


@app.route('/api/logout', methods=['POST'])
def api_logout():
    """退出登录，清除 Cookie"""
    resp = jsonify({'success': True})
    resp.set_cookie('auth_uid', '', expires=0, path='/')
    session.pop('captcha_code', None)
    return resp


@app.route('/logout', methods=['GET'])
def page_logout():
    """页面级退出：清除 Cookie 并重定向到登录页"""
    resp = send_from_directory(os.path.join(PROJECT_ROOT, 'frontend'), 'login.html')
    resp.set_cookie('auth_uid', '', expires=0, path='/')
    session.pop('captcha_code', None)
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return resp


@app.route('/api/check-auth', methods=['GET'])
def api_check_auth():
    """检查登录状态"""
    uid = request.cookies.get('auth_uid')
    if not uid:
        return jsonify({'logged_in': False}), 200

    conn = get_db_conn()
    cursor = conn.execute('SELECT uid, nickname, role FROM users WHERE uid = ?', (uid,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        resp = jsonify({'logged_in': False})
        resp.set_cookie('auth_uid', '', expires=0, path='/')
        return resp

    return jsonify({
        'logged_in': True,
        'uid': user['uid'],
        'nickname': user['nickname'],
        'role': user['role']
    })


# ═══════════════════════════════════════════════════════
#  Cookie 管理接口


# ═══════════════════════════════════════════════════════
#  Cookie 管理接口
# ═══════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════
#  Cookie 管理接口（支持两种 Cookie 分别管理）
#  - data/cookie.json        → UID 查询（server1.tuwan.com:10010）
#  - data/cookie_bigdata.json → 数据抓取（bigdata.tuwan.com）
# ═══════════════════════════════════════════════════════

COOKIE_FILE_UID = os.path.join(PROJECT_ROOT, 'data', 'cookie.json')
COOKIE_FILE_BIGDATA = os.path.join(PROJECT_ROOT, 'data', 'cookie_bigdata.json')


def _check_cookie_status(path: str, required_fields: list) -> dict:
    """通用 Cookie 状态检测"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
        cookie_str = cfg.get('cookie_str', '')
        checks = {field: field in cookie_str for field in required_fields}
        all_ok = all(checks.values())
        return {
            'status': 'valid' if all_ok else 'invalid',
            'updated_at': cfg.get('updated_at', ''),
            'length': len(cookie_str),
            'checks': checks,
        }
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


@app.route('/api/cookie', methods=['GET'])
@login_required
def api_cookie_get():
    """获取 UID 查询 Cookie 状态"""
    return jsonify(_check_cookie_status(COOKIE_FILE_UID, ['PHPSESSID', 'DedeUserID']))


@app.route('/api/cookie', methods=['POST'])
@login_required
def api_cookie_update():
    """更新 UID 查询 Cookie
    请求体: { cookie_str: string, basic_auth?: string }
    """
    body = request.get_json() or {}
    cookie_str = body.get('cookie_str', '').strip()
    basic_auth = body.get('basic_auth', '').strip()

    if not cookie_str:
        return jsonify({'error': 'Cookie 不能为空'}), 400
    if 'PHPSESSID' not in cookie_str:
        return jsonify({'error': 'Cookie 格式不正确，缺少 PHPSESSID'}), 400

    try:
        cfg = {
            'cookie_str': cookie_str,
            'basic_auth': basic_auth or 'MjAxODoyMDE4dHV3YW50ZW5nZmVp',
            'updated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'source': 'frontend',
        }
        with open(COOKIE_FILE_UID, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)

        os.environ['UID_QUERY_COOKIE'] = cookie_str
        if basic_auth:
            os.environ['UID_BASIC_AUTH'] = basic_auth

        return jsonify({
            'success': True,
            'message': 'UID 查询 Cookie 更新成功',
            'updated_at': cfg['updated_at'],
            'length': len(cookie_str),
        })
    except Exception as e:
        return jsonify({'error': f'保存失败: {e}'}), 500


@app.route('/api/cookie/bigdata', methods=['GET'])
@login_required
def api_cookie_bigdata_get():
    """获取 bigdata 抓取 Cookie 状态"""
    return jsonify(_check_cookie_status(COOKIE_FILE_BIGDATA, ['PHPSESSID', 'Tuwan_Passport']))


@app.route('/api/cookie/bigdata', methods=['POST'])
@login_required
def api_cookie_bigdata_update():
    """更新 bigdata 抓取 Cookie
    请求体: { cookie_str: string }
    """
    body = request.get_json() or {}
    cookie_str = body.get('cookie_str', '').strip()

    if not cookie_str:
        return jsonify({'error': 'Cookie 不能为空'}), 400
    if 'PHPSESSID' not in cookie_str:
        return jsonify({
            'error': 'Cookie 格式不正确，缺少 PHPSESSID',
            'hint': '请从浏览器访问 bigdata.tuwan.com/sisters/tj，F12 → Network → 复制 Cookie'
        }), 400

    try:
        cfg = {
            'cookie_str': cookie_str,
            'updated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'source': 'frontend',
        }
        with open(COOKIE_FILE_BIGDATA, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)

        return jsonify({
            'success': True,
            'message': '数据抓取 Cookie 更新成功',
            'updated_at': cfg['updated_at'],
            'length': len(cookie_str),
        })
    except Exception as e:
        return jsonify({'error': f'保存失败: {e}'}), 500





@app.route('/api/cookie/auto-login', methods=['POST'])
@login_required
def api_cookie_auto_login():
    """手动兜底：立即自动重登刷新 Cookie（复用 crawler/auto_login.py 的 OCR 登录）
    请求体: { target: 'uid' | 'bigdata' | 'all' }（默认 all）
    重登后跑一次保活复查，把真实活性写回 keepalive_status.json，前端状态灯即时更新。
    """
    body = request.get_json() or {}
    target = body.get('target', 'all')
    if target not in ('uid', 'bigdata', 'all'):
        return jsonify({'error': 'target 必须是 uid / bigdata / all'}), 400

    try:
        from auto_login import refresh_uid_cookie, refresh_bigdata_cookie, refresh_all
    except Exception as e:
        return jsonify({'error': f'auto_login 模块加载失败: {e}'}), 500

    result = {}
    try:
        if target == 'uid':
            refresh_uid_cookie()
            result['uid'] = {'ok': True}
        elif target == 'bigdata':
            refresh_bigdata_cookie()
            result['bigdata'] = {'ok': True}
        else:
            result.update(refresh_all())
    except Exception as e:
        key = 'uid' if target == 'uid' else ('bigdata' if target == 'bigdata' else 'all')
        result[key] = {'ok': False, 'msg': str(e)}

    # 重登后立即保活复查：写入真实活性，前端状态灯即时刷新
    try:
        from cookie_keepalive import run_keepalive
        result['keepalive'] = run_keepalive()
    except Exception as e:
        result['keepalive'] = {'error': str(e)}

    return jsonify(result)


@app.route('/api/last-update')
@login_required
def api_last_update():
    """返回上次数据更新时间"""
    try:
        with open(os.path.join(PROJECT_ROOT, 'data', 'last_update.json'), 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception:
        return jsonify({'last_update': '从未更新', 'status': 'unknown'})


@app.route('/api/keepalive-status')
@login_required
def api_keepalive_status():
    """Cookie 保活状态（由后台保活线程每30分钟写入）"""
    try:
        with open(os.path.join(PROJECT_ROOT, 'data', 'keepalive_status.json'), 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    except Exception:
        return jsonify({'last_run': None, 'uid': None, 'bigdata': None})

# ========== 静态文件服务 ==========


# ========== 静态文件服务 ==========
@app.route('/')
def index():
    response = send_from_directory(os.path.join(PROJECT_ROOT, 'frontend'), 'index.html')
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.route('/<path:path>')
def static_files(path):
    response = send_from_directory(os.path.join(PROJECT_ROOT, 'frontend'), path)
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


# 全局响应拦截：所有响应强制禁用浏览器缓存
@app.after_request
def add_no_cache_headers(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
