# 姐妹团数据统计报表

> 兔玩大数据平台姐妹团模块的数据统计与可视化报表系统，用于追踪 2026-07-17 新政策上线前后的关键指标变化。

---

## 功能特性

| 模块 | 功能 |
|------|------|
| 📊 周报概览 | KPI 卡片（新成团/进行中/留存率/解散率/流水/成就率）、预警列表、趋势图 |
| 📈 核心趋势 | 留存率折线、解散率叠加图、流水柱状图、任务堆叠图，支持时间截断 |
| 🔍 对比分析 | 政策前后对比表、大厅排名 Top10、新成团vs解散双轴图 |
| 📋 明细数据 | 搜索（ID/昵称/大厅）、状态筛选、分页导航、UID点击跳转、大厅切换 |
| 👤 UID查询 | 本周vs上周对比、姐妹团参与信息、姐姐vs妹妹对比图、CSV导出 |
| 👤 UID查询 | 本周vs上周对比、姐妹团参与信息、CSV导出 |
| 🍪 Cookie管理 | 双Cookie分别管理（UID查询 / 数据抓取）|
| 📤 数据导出 | 周报CSV、明细CSV、周报PDF（含KPI+预警+图表）|

---

## 技术栈

- **后端**: Python 3.11 + Flask + SQLite
- **前端**: 纯 HTML + JavaScript + ECharts 5
- **数据抓取**: requests + BeautifulSoup4
- **部署**: Docker / Windows 本地

---

## 部署方式

### 方式一：Windows 本地部署（推荐）

**前提**: 已安装 Python 3.11+

```bash
cd D:\姐妹团看板系统
deploy.bat
```

脚本自动完成：检查 Python → 安装依赖 → 初始化数据库 → 启动服务。

访问: `http://127.0.0.1:5000`

外部访问：`http://192.168.100.19:5000`

---

### 方式二：Docker 部署

**前提**: 已安装 Docker Desktop

```bash
cd D:\姐妹团看板系统

# 构建镜像
docker-compose build --no-cache

# 后台启动
docker-compose up -d

# 查看日志
docker-compose logs -f
```

访问: `http://127.0.0.1:5000`

#### 手机/局域网访问

1. 查看电脑局域网 IP：`ipconfig`，找 `192.168.x.x`
2. 确保手机和电脑连接**同一 WiFi**
3. 手机浏览器访问 `http://192.168.x.x:5000`
4. 如无法访问，检查 Windows 防火墙是否放行 5000 端口

#### 常用命令

| 命令 | 作用 |
|------|------|
| `docker-compose up -d` | 后台启动 |
| `docker-compose down` | 停止并删除容器 |
| `docker-compose ps` | 查看运行状态 |
| `docker-compose restart` | 重启服务 |

---

## 首次使用

### 1. 更新 Cookie

点击页面右上角 **🍪 Cookie 管理**，分别粘贴：
- **UID 查询 Cookie**: 从 `server1.tuwan.com:10010` 页面复制
- **数据抓取 Cookie**: 从 `bigdata.tuwan.com` 页面复制

Cookie 格式要求包含 `PHPSESSID`。

### 2. 抓取数据

首次使用数据库为空，需要手动抓取历史数据：

```bash
# 在项目目录执行
python daily_crawl.py
```

或配置 Windows 定时任务自动每日更新：
```bash
python setup_task.py
```

### 3. 使用 UID 查询

- 在 **👤 UID查询** 标签页输入 UID
- 勾选「模拟数据模式」可无需内网测试前端
- 关闭模拟模式需确保已更新有效 Cookie 且连接内网

---

## 项目结构

```
姐妹团看板系统/
├── backend/
│   └── app.py              # Flask API 主入口
├── crawler/
│   ├── crawler.py          # 数据抓取
│   ├── db.py               # 数据库操作
│   ├── uid_crawler.py      # UID查询抓取
│   ├── metrics.py          # 指标计算
│   └── alerts.py           # 预警引擎
├── data/
│   ├── stats.db            # SQLite 数据库
│   ├── schema.sql          # 表结构
│   ├── cookie.json         # UID查询Cookie
│   ├── cookie_bigdata.json # 数据抓取Cookie
│   └── exports/            # 导出文件
├── frontend/
│   └── index.html          # 前端单页应用
├── Dockerfile              # Docker镜像构建
├── docker-compose.yml      # Docker编排
├── deploy.bat              # Windows一键部署
├── start.bat               # 开发启动
├── requirements.txt        # Python依赖
└── 需求文档.md              # PRD需求文档
```

---

## 数据更新策略

| 数据 | 更新频率 | 方式 |
|------|---------|------|
| 统计数据 | T+1 | `daily_crawl.py` 定时抓取 |
| 基础数据 | T+1 | 随统计数据一起更新 |
| UID数据 | 按需 | 手动查询或批量查询 |
| Cookie | 按需 | 前端粘贴更新 |

---

## 核心指标计算说明

| 图表 | 数据来源 | 计算公式 |
|------|---------|---------|
| 💯 留存率趋势 | `weekly_report` 表 | (周末进行中 - 本周新成团) / 周始进行中 × 100% |
| 🚫 解散率趋势 | `weekly_report` 表 | 本周解散数 / ((周始进行中 + 周末进行中) / 2) × 100% |
| 💰 礼物流水趋势 | `weekly_report` 表 | 本周7天 `reward_amount` 累计（全部大厅总和） |
| 📊 任务活跃度 | `weekly_report` 表 | (开车任务 + 陪档任务 + 收送礼任务) / 周末进行中 |

**术语说明：**
- **周始进行中**：本周第一天（周一）正在进行中的姐妹团数量
- **周末进行中**：本周最后一天（周日）正在进行中的姐妹团数量
- **本周新成团**：本周内新成立的姐妹团数量
- **本周解散数**：本周内解散的姐妹团数量

---

## 版本历史

---

## 版本历史

### v1.0.1 (2026-07-31)

- ✅ 明细数据搜索支持大厅名称筛选（搜索框输入大厅名即可过滤）
- ✅ UID查询新增姐姐vs妹妹对比分析图表
- ✅ 姐姐vs妹妹柱状图使用独立Y轴，避免数值差异过大

### v1.0.0 (2026-07-31)

- ✅ 周报概览：KPI卡片 + 趋势图 + 预警列表
- ✅ 核心趋势：4图联动 + 时间截断 + 政策分界线
- ✅ 对比分析：政策前后对比 + 大厅排名 Top10 + 双轴图
- ✅ 明细数据：搜索/分页/状态筛选/UID点击跳转
- ✅ UID查询：本周vs上周 + 姐妹团信息 + CSV导出
- ✅ Cookie管理：双Cookie分别管理
- ✅ 数据导出：周报CSV、明细CSV、周报PDF（含图表+预警）
- ✅ 预警系统：自动生成5条规则
- ✅ Docker部署支持 + Windows一键启动
- ✅ 定时任务：每日23:30自动抓取

- ✅ 周报概览：KPI卡片 + 趋势图 + 预警列表
- ✅ 手机响应式：基础适配
- ⚠️ 手机响应式：基础适配

---

## 常见问题

**Q: 如何启动服务？**
A: 两种方式：
- 开发启动：`.venv\Scripts\python.exe start.py`（自动打开浏览器）
- 生产部署：双击 `deploy.bat`

**Q: 如何按大厅筛选数据？**
A: 两种方式：
1. **顶部工具栏**的「全部大厅」下拉框 → 控制**整个页面**的数据范围（KPI、趋势图、明细表等）
2. **明细搜索框**输入大厅名称 → 只过滤**明细表格**的数据

**Q: 页面空白怎么办？**
A: 按 `Ctrl+F5` 强制刷新清除缓存；检查后端是否启动；F12 控制台查看 JS 错误。

**Q: UID查询显示"Cookie过期"？**
A: 打开 UID查询页面 → F12 → Network → 复制 Cookie → 粘贴到 Cookie管理 → 保存。

**Q: 数据不更新？**
A: 检查 `data/last_update.json` 确认上次更新时间；运行 `python daily_crawl.py` 手动抓取；或配置定时任务 `python setup_task.py`。

**Q: 启动报 `ModuleNotFoundError`？**
A: 确保使用 `.venv\Scripts\python.exe` 运行，而不是系统 Python。虚拟环境已包含所有依赖。

---

> 项目路径: `D:\姐妹团看板系统`
> Git标签: `v1.0.1`
