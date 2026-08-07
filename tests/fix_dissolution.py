path = r"D:\姐妹团看板系统\crawler\metrics.py"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# 找到解散率注释行并替换
for i, line in enumerate(lines):
    if '# 3. 解散率' in line:
        # 替换当前行和下一行（空行）
        lines[i] = "    # 3. 解散率 = 本周解散数 / 周始进行中 × 100\n"
        lines[i+1] = "    if metrics['active_team_count_start'] > 0:\n"
        lines.insert(i+2, "        metrics['dissolution_rate'] = round(\n")
        lines.insert(i+3, "            metrics['dissolved_count'] / metrics['active_team_count_start'] * 100, 2\n")
        lines.insert(i+4, "        )\n")
        lines.insert(i+5, "    else:\n")
        lines.insert(i+6, "        metrics['dissolution_rate'] = 0.0\n")
        break

with open(path, "w", encoding="utf-8") as f:
    f.writelines(lines)

print("metrics.py updated")
