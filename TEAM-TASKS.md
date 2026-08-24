# TEAM-TASKS.md — 同路行当前任务状态

> 架构基线更新（2026-08-24）：客户端由微信小程序切换为 Vue 3 + Vite + TypeScript + Vant + Pinia + PWA；认证改为七牛云短信验证码 + HttpOnly Cookie；单台 VM 的目标生产拓扑使用 Docker Compose 运行 Nginx、Web、NestJS API 和 PostgreSQL；地图统一高德；聊天采用 Socket.IO + PostgreSQL，Redis 暂不接入。

> Codex 统筹者每次会话开始必读；任务分配或状态变化时追加/更新记录，保留历史。

## 协作架构

- 统筹者：Codex
- 规划与风险复核：Reasonix DeepSeek V4 Flash
- 高风险独立审查：Reasonix GLM-5.2
- 实现与测试：Kimi K3
- 项目规则：见项目根 `AGENTS.md`

## 当前状态

**Task 1 后端骨架已完成并通过既有基础验证；网站客户端与生产 Compose 尚未实现。** 文档 v4.1 已统一多人确认、手机优先 Web/PWA 与 P0 手动 SOS 边界；后续任务必须以该基线为准。

## 任务分配表

| 任务 ID | 任务描述 | 执行者 | 状态 | 产出 | 更新时间 |
|---|---|---|---|---|---|
| BOOT-20260823-01 | 初始化 Git、建立项目协同规则和代理路由 | Codex | 已完成 | `AGENTS.md`、`TEAM-TASKS.md`、Git 仓库 | 2026-08-23 |
| DEV-20260823-01 | Task 1：NestJS + Prisma 后端骨架与数据库基线 | Kimi K3 → Codex | 待审查 | `apps/api/`、`docker-compose.yml`、`.env.example` | 2026-08-23 |
| DOC-20260824-01 | 文档 v4.1 一致性复审与网站/PWA 移动端规范 | Codex + 独立审查 | 已完成 | `02`–`07`、`DEPLOYMENT.md`、`.env.example`、`docker-compose.yml` | 2026-08-24 |

## Task 1 审查记录

- Kimi 状态：`DONE_WITH_CONCERNS`；未生成自身报告/提交，自动会话在工具执行后停滞。
- Codex 验证：`npm test -- --runInBand` 通过（1/1）；`npm run build` 通过；带临时 `DATABASE_URL` 的 `npm run prisma:validate` 通过。
- 剩余风险：容量约束和状态事务留给 Task 2/3；生产 PostgreSQL 部署方式仍待上线前确定。

## 文档 v4.1 复审记录

- 独立审查：已完成只读跨文档复核；Codex 已检查并同步采纳与当前范围一致的结论。
- 已统一：3/4 人总人数、一次申请 1–2 席、原子容量校验、全员确认、15 秒反悔/退出边界、短信登录即手机号验证、P0 SOS 事件审计与手动拨号、手机优先 Web/PWA 交互规范、竞品网站化口径。
- 配置基线：移除旧微信环境变量；当前 Compose 明确为开发数据库基线。`nginx`、`web`、`api`、`postgres` 的生产 Compose 需在网站客户端和 API 容器化任务中落地。
- 验证：`git diff --check` 与术语一致性扫描通过；同步到 `E:\Codeway` 后已完成 SHA-256 核对和二次扫描。

## 子任务模板

`目标｜输入文件｜产出文件｜不可修改范围｜验收命令｜完成标准｜状态回写`

## 调用与审查规则

- 涉及 3 个以上文件、跨前后端/数据库边界、预计超过 30 分钟，或有安全/迁移/发布风险时，至少调用一个子代理。
- 规划、架构权衡和常规审查优先 Reasonix DeepSeek；复杂架构、安全和高风险改动升级 GLM-5.2。
- 跨文件编码、测试和文档落地交给 Kimi K3；由 Codex 或 Reasonix 独立复核。
- 高风险改动必须使用与实现者不同的代理复核。
- 子代理返回后，Codex 必须检查 diff、运行验收命令，并在此文件记录结论、文件路径、测试结果和剩余风险。

## 安全待办

- Kimi CLI 凭据轮换后改用环境变量注入；不得将新凭据写入仓库。
- 域名、HTTPS、ICP备案、CORS/Allowed Origins、Cookie 域与安全属性、七牛云 VM 规格、备份与恢复演练在部署任务开始前补齐。
