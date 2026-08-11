path = r'D:\姐妹团看板系统\backend\app.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 删除第 235-259 行（0-based 234-258），这些是重复的 api_halls 定义
del lines[234:259]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('OK')
