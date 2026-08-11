path = r'D:\姐妹团看板系统\frontend\js\api.js'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 删除第 40-55 行（0-based 39-54），这些是旧的重复代码
del lines[39:55]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('OK')
