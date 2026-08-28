# deploy/nginx.Dockerfile
# 多阶段：先构建 Vue PWA 静态资源，再交给 nginx:alpine 托管并反代 /api。
# 构建上下文为仓库根目录（见 docker-compose.prod.yml 的 context: .）。
FROM node:20-alpine AS web-build
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm ci
COPY apps/web ./
# 同域部署：API base url 用相对 /api，浏览器按页面源访问，避免跨域 Cookie 问题。
ENV VITE_API_MODE=http
ENV VITE_API_BASE_URL=/api
ENV VITE_ENABLE_DEV_LOGIN=false
RUN npm run build

FROM nginx:1.27-alpine AS nginx
# 删除默认 server 块；真正的 server 配置由运行时挂载的 deploy/nginx.conf 决定
# （HTTPS 强制 或 备案前的 http-only 试点）。
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=web-build /web/dist /usr/share/nginx/html
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
