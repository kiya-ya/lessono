with open('backend/app.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the duplicate block starting at line 1066 (0-indexed 1065)
# It's "    # 附加姐妹团信息\n    if team_info:\n        result['team_info'] = team_info\n    team_id = body.get('team_id')..."
# We need to remove from line 1066 to line 1081 (0-indexed)

# Actually the file is messed up again. Let's find the clean structure.
# The correct end of api_uid_query should be:
#   return jsonify(result)
# followed by @app.route('/api/uid-query/types')

# Find the second "    result = None" after the first one - that's the duplicate
first_result_none = None
second_result_none = None
for i, line in enumerate(lines):
    if line.strip() == 'result = None':
        if first_result_none is None:
            first_result_none = i
        else:
            second_result_none = i
            break

if second_result_none:
    # Find where the duplicate block ends (next @app.route)
    end_idx = None
    for j in range(second_result_none, len(lines)):
        if "@app.route('/api/uid-query/types')" in lines[j]:
            end_idx = j
            break
    
    if end_idx:
        # Also remove the coverage logic (lines 1052-1064)
        # Find "    # 用本地团总流水覆盖个人累计流水"
        cover_start = None
        for k in range(first_result_none, second_result_none):
            if '用本地团总流水覆盖' in lines[k]:
                cover_start = k
                break
        
        if cover_start:
            # Remove from cover_start to just before "    # 附加姐妹团信息"
            # But keep one "    # 附加姐妹团信息\n    if team_info:\n        result['team_info'] = team_info"
            
            # Find the clean end of the function
            clean_end = None
            for m in range(cover_start, second_result_none):
                if lines[m].strip() == "return jsonify(result)":
                    clean_end = m + 1
                    break
            
            if clean_end:
                new_lines = lines[:cover_start] + lines[clean_end:second_result_none] + lines[end_idx:]
                with open('backend/app.py', 'w', encoding='utf-8') as f:
                    f.writelines(new_lines)
                print(f"Fixed: removed coverage logic and duplicate block")
            else:
                print("clean_end not found")
        else:
            print("cover_start not found")
    else:
        print("end_idx not found")
else:
    print("second_result_none not found")
