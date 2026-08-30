# Codeway(同路行)

顺风车拼车平台——NestJS + Prisma + PostgreSQL 后端 + Vue 3 Web/PWA 前端。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | NestJS + TypeScript + Prisma + PostgreSQL |
| Web 前端 | Vue 3 + Vite + Vant + Pinia + PWA |
| 小程序 | 微信小程序(规划中) |

## 目录结构

```
apps/api/            NestJS 后端(核心)
  src/trips/         行程发布/加入/双向确认(15 秒反悔回退)
  src/fare/          费用订单/争议/结算
  src/platform/      评价/举报/紧急联系/埋点
  prisma/            数据模型 + migrations
  test/              e2e 测试
apps/web/            Vue 3 + Vant Web/PWA 前端
docs/                设计文档 + superpowers 计划/规格
docker-compose.yml   PostgreSQL 本地环境
```

## 快速开始

```bash
# 后端（PowerShell）
Set-Location apps/api
Copy-Item .env.example .env
npm ci
npm run prisma:generate
npm test -- --runInBand --no-cache
npm run start:dev

# Web 前端（PowerShell）
Set-Location ../web
npm ci
npm test
npm run dev
```

## 测试现状

以本地新鲜命令输出为准，不在文档中硬编码易过时的测试数量：

- API 单测：`npm test -- --runInBand --no-cache`
- API PostgreSQL HTTP E2E（需要真实 `DATABASE_URL`）：`npm run test:e2e:postgres`
- Web 类型检查：`npm run typecheck`
- Web 测试：`npm test`
- Web 生产构建：`npm run build`

提交前必须至少运行 API 单测、Prisma 校验、API 构建和 Web 类型检查；真实 PostgreSQL/Kodo/短信联调需在对应环境单独验收。

## 贡献约定
- 分支开发使用 `codex/`、`reasonix/` 或 `kimi/` 前缀；提交信息使用 `codex:` / `reasonix:` / `kimi:` 前缀
- 敏感信息(密钥/token)严禁提交,统一放 `.env`(已被 .gitignore 排除)
- 微信小程序仍处于规划中，当前交付形态为 Vue 3 Web/PWA + NestJS API。
- 提交前确保后端 `npm test`、`npm run build` 与 Web `npm run typecheck` 均通过
