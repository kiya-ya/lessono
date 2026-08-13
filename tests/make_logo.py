#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成登录页 LOGO：把点点开黑 LOGO 的黄色背景替换为主题色
用法: .venv/Scripts/python.exe tests/make_logo.py [主题色hex]
默认主题色 #4F5BD5（全站品牌靛蓝）。换主题色时重新运行本脚本即可。
"""
import sys
from PIL import Image

SRC = 'frontend/assets/点点开黑LOG.jpg'
DST = 'frontend/assets/logo-ddkh.png'
THEME = sys.argv[1] if len(sys.argv) > 1 else '#4F5BD5'
SIZE = 256


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def main():
    img = Image.open(SRC).convert('RGB')
    theme = hex_rgb(THEME)
    # 先缩小再处理（256x256，速度和边缘平滑度都更好）
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    bg = img.getpixel((5, 5))
    px = img.load()
    w, h = img.size
    thr = 95  # 颜色距离阈值（覆盖黄色噪点纹理）

    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            d = ((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2) ** 0.5
            if d < thr:
                # 阈值内按距离渐变混合，保留边缘抗锯齿
                t = 1 - d / thr  # 1=纯背景, 0=阈值边缘
                blend = min(1.0, t * 2.2)  # 加速过渡，边缘更利落
                nr = int(r * (1 - blend) + theme[0] * blend)
                ng = int(g * (1 - blend) + theme[1] * blend)
                nb = int(b * (1 - blend) + theme[2] * blend)
                px[x, y] = (nr, ng, nb)

    import os
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    img.save(DST, 'PNG')
    print(f'OK: {DST} ({SIZE}x{SIZE}), 背景 {bg} -> 主题色 {theme}')


if __name__ == '__main__':
    main()
