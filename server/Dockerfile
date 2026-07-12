# Lexnote 文档转换服务器
# 基于 Node.js + LibreOffice headless，将 DOCX/PPTX 转换为 PDF
#
# 构建并运行：
#   docker build -t lexnote-convert-server ./server
#   docker run -d -p 3001:3001 --name lexnote-server lexnote-convert-server
#
# 部署到 Render/Railway 等平台时，直接使用此 Dockerfile。

FROM node:20-alpine

# 安装 LibreOffice（headless 模式运行，无需 GUI 依赖）
RUN apk add --no-cache libreoffice \
    && mkdir -p /app

WORKDIR /app

# 复制依赖文件并安装
COPY package*.json ./
RUN npm install --production

# 复制源码
COPY . .

# 创建临时文件目录（LibreOffice 需要可写的 home 目录）
RUN mkdir -p /tmp/lexnote-uploads /tmp/lexnote-converted
ENV HOME=/tmp

EXPOSE 3001

# 健康检查（每 30 秒检测一次）
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "index.js"]
