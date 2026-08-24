# TEAM-TASKS.md — 同路行当前任务状态

> Codex 统筹者每次会话开始必读；任务分配或状态变化时追加/更新记录，保留历史。

## 协作架构

- 统筹者：Codex
- 规划与风险复核：Reasonix DeepSeek V4 Flash
- 高风险独立审查：Reasonix GLM-5.2
- 实现与测试：Kimi K3
- 项目规则：见项目根 `AGENTS.md`

## 当前状态

**Web/PWA 前端与独立后端基线开发进行中。** 前端 Task 1–6 已完成；后端 Task 1（NestJS + Prisma + PostgreSQL 骨架）已完成，下一步进入行程容量与加入接口。

## 任务分配表

| 任务 ID | 任务描述 | 执行者 | 状态 | 产出 | 更新时间 |
|---|---|---|---|---|---|
| BOOT-20260823-01 | 初始化 Git、建立项目协同规则和代理路由 | Codex | 已完成 | `AGENTS.md`、`TEAM-TASKS.md`、Git 仓库 | 2026-08-23 |
| WEB-20260824-01 | Vue 3 + Vite + Vant + Pinia + PWA 基础工程、契约 Adapter 与 Mock | Codex + 实现代理 | 已完成 | `apps/web/`、`docs/superpowers/specs/2026-08-24-web-pwa-design.md`、`docs/superpowers/plans/2026-08-24-web-pwa.md` | 2026-08-24 |
| WEB-20260824-02 | 登录、行程列表/筛选、发布、详情、加入申请与访问保护 | Codex + Reasonix 复核 | 已完成 | `apps/web/src/views/`、`apps/web/src/components/`、`apps/web/src/api/`、`apps/web/src/router/` | 2026-08-24 |
| DEV-20260823-01 | Task 1：NestJS + Prisma 后端骨架与数据库基线 | Kimi K3 → Codex | 已完成 | `apps/api/`、`docker-compose.yml`、`.env.example` | 2026-08-23 |

## Task 1 后端审查记录

- 源分支提交：`260c030 kimi: scaffold api and database baseline`；当前分支合并提交：`a764b64`。
- Codex 验证：健康检查测试、Nest build、Prisma schema validate 通过；报告：`.superpowers/sdd/2026-08-23-backend-trip-flow/task-1-report.md`。
- 剩余风险：容量约束和状态事务留给后端 Task 2/3；生产 PostgreSQL 部署方式仍待上线前确定。

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
- 域名、HTTPS、小程序服务器域名、七牛云 VM 规格和备份策略在部署任务开始前补齐。

# Task 3 frontend status

- Commit `ee77032`: login, trip discovery/filtering, publish validation, detail and join sheet.
- Verification: targeted Vitest 2 files / 2 tests passed; `npm run typecheck` passed; `npm run build` passed with PWA assets; `git diff --check` passed.
- Note: targeted TripsView test emits a Vue router injection warning because it intentionally mounts without a router; production build is clean.

## Web/PWA Task 1–3 审查记录

- 视觉与移动基线：深墨蓝、夜行蓝、路灯橙、雾白；手机单列、44px 触控目标、48px 主按钮、安全区和 `100dvh` 已落地。
- Adapter：HTTP 对后端 `departTime/reasonCodes/OPEN_SLOT` 归一化为前端字段；详情使用 `GET /trips/:id`，满员行程不会从详情中消失。
- 访问与可用性：发布/详情受保护路由保存安全同源 redirect；加入弹层支持 `aria-modal`、初始焦点、Escape 和焦点恢复；卡片支持 Enter/Space。
- 最新验证：`npm test` → 6 个测试文件、15 个测试通过；`npm run typecheck` 通过；`npm run build` 通过并生成 `manifest.webmanifest`、`sw.js`；`git diff --check` 通过。列表测试仍有一个未注入 Router 的 Vue warning，不影响测试结果。
- 协作：Kimi CLI 本轮启动时返回 `Agent event 'agent.activity.updated' has no active lifecycle context`，未能执行；由等价实现代理完成 bounded Task 3。Reasonix DeepSeek 完成独立风险复核并推动契约映射、登录回跳和可访问性修复。
- 后续边界：Task 4 需重新设计 Mock 的 `CONFIRMING → FORMED → 15 秒撤回` 全员确认模型；当前确认 Adapter 仅保留接口对齐，不将单人确认误当成最终成团。

## WEB-20260824-04 确认与费用锁定闭环
- 状态：已完成（commit c5e12aa）
- 产出：CONFIRMING 全员确认、FORMED 15秒反悔倒计时、confirmationId 撤回、争议/结算锁定、金额 >0 校验。
- 验证：3 suites/9 tests passed；typecheck/build passed；diff check仅已修复末尾空行。

## WEB-20260824-05 SOS 与个人页
- 状态：已完成（commit dc1872d）
- 产出：移动端长按 SOS 事件记录、手动拨打 110、紧急联系人引导、个人页入口。
- 边界：不自动短信/报警，不保存精确位置；联系人当前为页面演示状态，持久化需后端契约。
- 验证：专项测试、typecheck、build 通过；由独立实现代理完成。

## WEB-20260824-06 集成验收
- 状态：进行中
- 当前证据：完整 Vitest 11 suites/20 tests passed；typecheck、生产 build（含 PWA manifest/sw）和 git diff --check 通过。
- 剩余：页面连通性与聊天/评价反馈细节继续收敛；HTTP 路径仍需以后端 OpenAPI 最终契约对齐。
