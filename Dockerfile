# 雲端部署：一個服務同時提供前台、後台與 API
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

ENV PUBLIC_MODE=1
EXPOSE 3001
CMD ["npm", "start"]
