# 同路行 MVP 部署说明

## 组件

- 七牛云 VM：运行 NestJS API。
- PostgreSQL：业务事实源，建议与 API 同地域并限制内网访问。
- 七牛云 Kodo：订单截图私有桶；数据库只保存对象 key、MIME、大小和生命周期元数据。
- Redis：MVP 暂不部署；扩展多实例 WebSocket、限流或广播前再引入。

## 环境变量

复制 `.env.example` 为 `.env`，设置真实值。禁止提交 `.env`、微信密钥、Kodo 密钥或高德 Key。

必须项：`DATABASE_URL`、`POSTGRES_PASSWORD`、`PORT`。

适配器项：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`KODO_BUCKET`、`KODO_ACCESS_KEY`、`KODO_SECRET_KEY`、`AMAP_SERVER_KEY`。未配置时保持手动降级。

## 发布检查

```powershell
npm ci
npm run prisma:generate
npm run prisma:validate
npm run build
npm test -- --runInBand --no-cache
npm start
```

生产环境必须使用 HTTPS、反向代理、日志脱敏、私有 Kodo 桶和数据库备份。`SKIP_DB_CONNECT=true` 只用于无数据库的启动 smoke，生产不得设置。
