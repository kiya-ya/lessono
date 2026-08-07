with open(r'D:/姐妹团看板系统/frontend/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 删除不带版本号的重复 JS 引用
for fname in ['config.js', 'utils.js', 'api.js', 'render.js', 'app.js']:
    old = f'<script src="js/{fname}"></script>'
    if old in content:
        content = content.replace(old, '')

with open(r'D:/姐妹团看板系统/frontend/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('duplicate js refs removed')
