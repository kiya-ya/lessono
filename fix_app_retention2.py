path = r'D:\姐妹团看板系统\backend\app.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 删除第 406-408 行（0-based 405-407）：重复的 decorators
del lines[405:408]

# 删除第 430-449 行（0-based 429-448）：旧函数体残留
# 因为已经删除了3行，所以原433-452变成了430-449
del lines[429:449]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('OK')
