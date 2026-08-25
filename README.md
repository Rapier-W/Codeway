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
# 后端
cd apps/api
cp .env.example .env
npm install
npx prisma generate
npm test -- --runInBand --no-cache    # 8 suites / 31 tests
npm run start:dev

# Web 前端
cd apps/web
npm install
npm test                              # 12 files / 22 tests
npm run dev
```

## 测试现状
- 后端:31 tests 全部通过(含行程容量并发、双向确认 e2e)
- Web:22 tests 全部通过

## 贡献约定
- 分支开发:`feature/xxx`、`fix/xxx`;提交信息 `feat:` / `fix:` / `docs:` / `chore:` 前缀
- 敏感信息(密钥/token)严禁提交,统一放 `.env`(已被 .gitignore 排除)
- 提交前确保后端 `npm test` 与 Web `npm test` 均通过