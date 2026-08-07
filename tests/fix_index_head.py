with open(r'D:/姐妹团看板系统/frontend/index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open(r'D:/姐妹团看板系统/frontend/index_head.html', 'r', encoding='utf-8') as f:
    new_head = f.readlines()

# 替换前14行（损坏的头部）为新的头部
lines = new_head + lines[14:]

with open(r'D:/姐妹团看板系统/frontend/index.html', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('index.html head fixed')
