#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
姐妹团数据定时任务配置脚本
以管理员身份运行：python setup_task.py
"""
import os
import subprocess
import sys

PROJECT_DIR = r'D:\姐妹团看板系统'
SCRIPT_PATH = os.path.join(PROJECT_DIR, 'daily_crawl.py')
LOG_PATH = os.path.join(PROJECT_DIR, 'data', 'crawl_log.txt')
TASK_NAME = '姐妹团数据自动抓取'
# 使用项目虚拟环境的 Python，避免系统 Python 缺少依赖
PYTHON_PATH = os.path.join(PROJECT_DIR, '.venv', 'Scripts', 'python.exe')


def check_admin():
    """检查是否以管理员身份运行"""
    try:
        import ctypes
        return ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        return False


def main():
    print('=' * 50)
    print('  姐妹团数据定时任务配置')
    print('=' * 50)

    # 检查文件
    if not os.path.exists(SCRIPT_PATH):
        print(f'[ERROR] 脚本不存在: {SCRIPT_PATH}')
        input('按回车退出...')
        return

    # 检查虚拟环境 Python 是否存在
    if not os.path.exists(PYTHON_PATH):
        print(f'[WARN] 虚拟环境 Python 不存在: {PYTHON_PATH}')
        print(f'[WARN] 将使用系统默认的 python，可能缺少依赖导致抓取失败')
        python_cmd = 'python'
    else:
        python_cmd = f'"{PYTHON_PATH}"'

    # 创建命令（每天 23:30）
    cmd = (
        f'cmd /c cd /d "{PROJECT_DIR}" && '
        f'{python_cmd} daily_crawl.py >> "{LOG_PATH}" 2>&1'
    )

    print(f'\n任务名称: {TASK_NAME}')
    print(f'执行时间: 每天 23:30')
    print(f'执行命令: {cmd}')
    print(f'日志文件: {LOG_PATH}')
    print()

    # 删除旧任务（如果存在）
    subprocess.run(['schtasks', '/delete', '/tn', TASK_NAME, '/f'],
                   capture_output=True)

    # 创建新任务
    result = subprocess.run([
        'schtasks', '/create',
        '/tn', TASK_NAME,
        '/tr', cmd,
        '/sc', 'daily',
        '/st', '23:30',
        '/f'
    ], capture_output=True, text=True)

    if result.returncode == 0:
        print('[OK] 计划任务创建成功！')
        print()
        print('任务详情:')
        print(f'  名称: {TASK_NAME}')
        print(f'  时间: 每天 23:30')
        print(f'  命令: {python_cmd} daily_crawl.py')
        print()
        print('如需修改或删除，请打开【任务计划程序】搜索"姐妹团"')
    else:
        print(f'[ERROR] 创建失败:')
        print(result.stderr)
        print()
        print('可能原因:')
        print('  1. 未以管理员身份运行')
        print('  2. 系统安全策略限制了计划任务创建')
        print()
        print('解决方法:')
        print('  方法A: 右键 -> 以管理员身份运行 cmd，再执行 python setup_task.py')
        print('  方法B: 手动创建（见下方步骤）')
        print()
        print('--- 手动创建步骤 ---')
        print('1. 按 Win+R，输入 taskschd.msc 回车')
        print('2. 右侧点击【创建基本任务...】')
        print('3. 名称填: 姐妹团数据自动抓取')
        print('4. 触发器选: 每天，时间 23:30:00')
        print('5. 操作选: 启动程序')
        print(f'6. 程序/脚本填: {PYTHON_PATH}')
        print(f'7. 起始于填: {PROJECT_DIR}')
        print(f'8. 参数填: daily_crawl.py')

    print()
    input('按回车退出...')


if __name__ == '__main__':
    main()
