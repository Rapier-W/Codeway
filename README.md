# Codeway(同路行)

顺风车拼车平台 MVP——NestJS + Prisma + PostgreSQL 后端 + 微信小程序前端。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | NestJS + TypeScript |
| ORM/数据库 | Prisma + PostgreSQL(Docker Compose) |
| 前端 | 微信小程序(开发中) |

## 目录结构

```
apps/api/            NestJS 后端(核心)
  src/trips/         行程发布/加入/双向确认(含 15 秒反悔回退)
  src/fare/          费用订单/争议/结算
  src/platform/      评价/举报/紧急联系/埋点
  prisma/            数据模型(17 个模型)+ seed
  test/              e2e 测试
apps/miniprogram/    小程序(当前为 API 契约与接入说明)
docs/                设计文档(功能清单/页面设计/架构方案等)
docker-compose.yml   PostgreSQL 本地环境
```

## 快速开始

```bash
# 1. 启动数据库
docker compose up -d

# 2. 安装依赖并准备环境
cd apps/api
cp .env.example .env      # 按需修改 DATABASE_URL 等
npm install
npx prisma generate       # 生成 Prisma Client
npx prisma migrate dev    # 首次需要;当前基线未含 migration,可先用 validate

# 3. 运行测试与启动
npm test -- --runInBand --no-cache
npm run start:dev
```

> 无数据库时可用 `SKIP_DB_CONNECT=true` 启动仅做 health smoke。

## 测试现状

- 8 test suites / 26 tests 全部通过(单测 + e2e)
- 验证命令:`npm test -- --runInBand --no-cache`

## 文档

- 功能清单: `docs/02-功能清单.md`
- 系统架构: `docs/07-系统架构方案.md`
- API 契约: `apps/miniprogram/api-contract.md`
- 部署说明: `DEPLOYMENT.md`(本地保留,未入库)

## 贡献约定

- 分支开发、提交信息带前缀:`feat:` / `fix:` / `chore:` / `docs:`
- 涉及 3 个以上文件或跨前后端改动,先在 issue 或文档中说明方案
- 环境敏感信息(密钥/token)严禁提交,统一放 `.env`(已被 .gitignore 排除)