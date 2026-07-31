# 简化版Dockerfile - 使用官方Python镜像，减少系统依赖
FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖（字体支持PDF中文）
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-wqy-zenhei \
    fonts-wqy-microhei \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY crawler/ ./crawler/
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY data/schema.sql ./data/
COPY init_db.py ./

# 创建必要目录
RUN mkdir -p data/exports logs

# 暴露端口
EXPOSE 5000

# 启动命令
CMD ["python", "backend/app.py"]
FROM python:3.11-slim

WORKDIR /app

# 复制依赖并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY crawler/ ./crawler/
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY data/schema.sql ./data/
COPY init_db.py ./

# 创建必要目录
RUN mkdir -p data/exports logs

# 暴露端口
EXPOSE 5000

# 启动命令
CMD ["python", "backend/app.py"]
