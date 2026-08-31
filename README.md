# Codeway（同路行）

顺风车拼车平台 —— NestJS + Prisma + PostgreSQL 后端 + Vue 3 Web/PWA 前端。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | NestJS + TypeScript + Prisma + PostgreSQL |
| Web 前端 | Vue 3 + Vite + Vant + Pinia + PWA |
| 小程序 | 微信小程序（规划中） |

## 目录结构

```
apps/api/            NestJS 后端（核心）
  src/trips/         行程发布/加入/双向确认（15 秒反悔回退）
  src/fare/          费用订单/争议/结算
  src/platform/      评价/举报/紧急联系/埋点
  src/auth/          短信验证码 + 微信小程序登录 + Cookie 会话
  src/storage/       七牛云 Kodo 对象存储（订单截图）
  src/ride/          高德地图 + 叫车平台适配器
  prisma/            数据模型 + migrations
  test/              e2e 测试
apps/web/            Vue 3 + Vant Web/PWA 前端
docs/                设计文档 + superpowers 计划/规格
deploy/              生产部署（nginx / 证书 / 上线清单 / 运维 runbook）
docker-compose.yml   PostgreSQL 本地环境
docker-compose.prod.yml  生产环境（nginx + api + postgres）
```

## 快速开始

```bash
# 后端
cd apps/api
cp .env.example .env      # 填 DATABASE_URL 等本地配置
npm install
npx prisma generate
docker compose up -d postgres
npx prisma migrate deploy
npm run start:dev

# Web 前端
cd apps/web
npm install
npm run dev
```

## 开发模式免验证码登录

开发环境默认走真实验证码流程（验证码打印在 API 控制台日志里）。如需「填手机号直接登录」的免验证码模式，在 `apps/web/.env.development` 里设置：

```
VITE_API_MODE=http
VITE_API_BASE_URL=/api
VITE_ENABLE_DEV_LOGIN=true
```

> `VITE_ENABLE_DEV_LOGIN=true` 只用于本地开发联调，**禁止在生产构建中开启**。后端对应的占位接口是 `POST /api/auth/dev-login`，服务端在 `NODE_ENV=production` 下会返回 404。

## 真实登录（微信小程序 / 短信）

- 微信登录：`apps/api/.env` 配 `WECHAT_APPID` + `WECHAT_APP_SECRET`，前端 `wx.login` 拿 code 调 `POST /api/auth/wechat-login`
- 短信验证码：`apps/api/.env` 配 `QINIU_ACCESS_KEY` / `QINIU_SECRET_KEY` / `QINIU_SMS_TEMPLATE_ID`（需企业资质）

## 对象存储（七牛云 Kodo）

`apps/api/.env` 配齐以下变量后启用真实 Kodo（未配置时开发环境回退到内存实现）：

```
QINIU_KODO_BUCKET=...
QINIU_KODO_UPLOAD_HOST=...
QINIU_KODO_DOWNLOAD_HOST=...
QINIU_KODO_ACCESS_KEY=...
QINIU_KODO_SECRET_KEY=...
```

## 测试现状

- 后端：114 tests 全部通过（含行程容量并发、双向确认 e2e、真实 PostgreSQL 锁竞争）
- Web：30 tests 全部通过

## 贡献约定

- 分支开发：`feature/xxx`、`fix/xxx`；提交信息 `feat:` / `fix:` / `docs:` / `chore:` 前缀
- 敏感信息（密钥/token）严禁提交，统一放 `.env`（已被 .gitignore 排除）
- 提交前确保后端 `npm test` 与 Web `npm test` 均通过
