path = r'D:\姐妹团看板系统\frontend\js\utils.js'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 删除第 10-21 行（0-based 9-20），这些是重复代码
del lines[9:21]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('OK')
