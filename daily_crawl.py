#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
姐妹团数据定时抓取脚本
建议通过 Windows 计划任务每天 23:30 运行
"""
import os
import sys
import json
import subprocess
import tempfile
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
LAST_UPDATE_FILE = os.path.join(DATA_DIR, 'last_update.json')

sys.path.insert(0, os.path.join(PROJECT_ROOT, 'crawler'))

from db import init_db
from crawler import run_all
from auto_login import refresh_all


def show_notification(title: str, message: str, timeout: int = 5):
    """Windows 弹窗通知（非阻塞，超时自动关闭）"""
    try:
        vbs_content = (
            'Set WshShell = WScript.CreateObject("WScript.Shell")\n'
            f'WshShell.Popup "{message}", {timeout}, "{title}", 64\n'
        )
        with tempfile.NamedTemporaryFile(mode='w', suffix='.vbs', delete=False) as f:
            f.write(vbs_content)
            vbs_path = f.name
        # 非阻塞运行
        subprocess.Popen(['wscript', vbs_path], shell=False,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        print(f'[Notify] 弹窗通知失败: {e}')


def main():
    print('=' * 55)
    print('  姐妹团数据定时抓取任务')
    print(f'  启动时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print('=' * 55)

    # 确保数据库存在
    init_db()

    status = 'failed'
    msg = '未知错误'

    try:
        # 0. 自动刷新两套 Cookie（每日兜底，防止会话过期导致抓取失败）
        try:
            res = refresh_all()
            for key, val in res.items():
                if val.get('ok'):
                    print(f'[AutoLogin] {key} Cookie 已自动刷新')
                else:
                    print(f'[AutoLogin-WARN] {key} 刷新失败: {val.get("msg")}')
        except Exception as ae:
            print(f'[AutoLogin-WARN] 自动刷新失败: {ae}')

        run_all()
        status = 'success'
        msg = '数据抓取成功'
        print(f'\n[SUCCESS] {msg}')

        # 离职原因细分（姐姐/妹妹/双方）+ 回写今日新快照
        try:
            from leaver_refine import refine_leavers, apply_leaver_reasons
            refine_leavers()
            apply_leaver_reasons()
        except Exception as le:
            print(f'[WARN] 离职原因细分失败: {le}')

        # 妹妹保护期结束时间同步（明细表「保护期结束」列）
        try:
            from protection_sync import sync_protection
            sync_protection(limit=120)
        except Exception as pe:
            print(f'[WARN] 保护期同步失败: {pe}')

        # 抓取成功后运行预警检测
        try:
            from alerts_engine import run_alerts_check
            run_alerts_check()
        except Exception as ae:
            print(f'[WARN] 预警检测运行失败: {ae}')

        # Cookie 保活（保持双系统会话活跃）
        try:
            from cookie_keepalive import run_keepalive
            run_keepalive()
        except Exception as ke:
            print(f'[WARN] Cookie保活运行失败: {ke}')
    except Exception as e:
        status = 'failed'
        msg = f'数据抓取失败: {e}'
        print(f'\n[ERROR] {msg}')

    # 记录更新时间
    record = {
        'last_update': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'status': status,
        'message': msg,
    }
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(LAST_UPDATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(record, f, ensure_ascii=False, indent=2)
        print(f'[INFO] 更新时间已记录: {record["last_update"]}')
    except Exception as e:
        print(f'[WARN] 更新时间记录失败: {e}')

    # 弹窗通知
    notif_title = '姐妹团数据抓取 — ' + ('成功' if status == 'success' else '失败')
    notif_msg = f'时间: {record["last_update"]}\\n结果: {msg}'
    show_notification(notif_title, notif_msg, timeout=8)

    print('=' * 55)
    print(f'  任务结束: {record["last_update"]}')
    print('=' * 55)


if __name__ == '__main__':
    main()
