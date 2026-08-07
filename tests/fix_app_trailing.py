path = r"D:\姐妹团看板系统\backend\app.py"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# 删除 1291-1297 行（0-based 1290-1296）的重复代码
# 保留正确的结构：index -> static_files -> after_request -> if __main__
if len(lines) > 1290:
    new_lines = lines[:1290]  # 保留到 "if __name__ == '__main__':"
    # 加上 app.run 调用
    new_lines.append("    app.run(host='0.0.0.0', port=5000, debug=False)\n")
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    print("Fixed app.py trailing code")
else:
    print("File shorter than expected")
