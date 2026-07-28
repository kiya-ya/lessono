FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY crawler/ ./crawler/
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY data/schema.sql ./data/

# 创建数据目录
RUN mkdir -p data/exports

# 初始化数据库
RUN python -c "import sys; sys.path.insert(0, 'crawler'); from db import init_db; init_db()"

# 暴露端口
EXPOSE 5000

# 启动命令
CMD ["python", "backend/app.py"]
