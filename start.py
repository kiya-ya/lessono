#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""姐妹团看板一键启动器"""
import subprocess
import time
import sys
import os
import socket
import webbrowser
from pathlib import Path

PROJECT_DIR = Path(r'D:\姐妹团看板系统')
HOST = '127.0.0.1'
PORT = 5000
URL = f'http://{HOST}:{PORT}/'


def is_port_open(host, port, timeout=1):
    """检查端口是否已监听"""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def main():
    os.chdir(PROJECT_DIR)
    
    print('=' * 40)
    print('  姐妹团数据看板 - 一键启动')
    print('=' * 40)
    print()
    
    # 1. 启动后端
    print('[1/3] 正在启动 Flask 后端服务...')
    proc = subprocess.Popen(
        [sys.executable, 'backend/app.py'],
        stdout=sys.stdout,
        stderr=sys.stderr,
        text=True,
        encoding='utf-8'
    )
    
    # 2. 等待服务就绪（轮询端口，最多等15秒）
    print('[2/3] 等待服务就绪...')
    for i in range(15):
        if is_port_open(HOST, PORT):
            break
        time.sleep(1)
        print(f'  等待中... {i+1}s')
    else:
        print('❌ 服务启动超时，请检查后端日志')
        proc.terminate()
        return
    
    # 3. 打开浏览器
    print('[3/3] 服务已启动，正在打开浏览器...')
    webbrowser.open(URL)

    print()
    print(f'✅ 看板已打开: {URL}')
    print('   按 Ctrl+C 关闭后端服务并退出')
    print()

    # 4. 持续运行，等待用户中断
    try:
        while proc.poll() is None:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print()
        print('正在关闭后端服务...')
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        print('✅ 后端已关闭')


if __name__ == '__main__':
    main()
