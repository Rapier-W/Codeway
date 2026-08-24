# AGENTS.md — 同路行项目协同开发规则

## 项目定位

同路行是微信小程序 + 独立后端的用户同路匹配服务。MVP 面向校园及周边试点，支持两人同行、行程匹配、聊天、双向确认、费用确认、争议处理、安全反馈和评价；不做司机端、资金托管、在线支付、车辆实时定位或自动行车守护。

## 统筹与代理分工

| Agent | 默认模型/入口 | 主要职责 |
|---|---|---|
| Codex | 当前 Codex 会话 | 需求澄清、架构取舍、任务拆分、集成、最终验收 |
| Reasonix | `D:\\Reasonix\\reasonix-cli.exe` | DeepSeek V4 Flash：规划、架构权衡、风险清单；GLM-5.2：高风险复核和独立审查 |
| Kimi Code CLI | `C:\\Users\\Rapier\\.kimi-code\\bin\\kimi.exe` | Kimi K3：跨文件实现、测试、重构和文档落地 |

Codex 对所有子代理结果负责：必须检查 diff、运行验收命令，并把结论写回 `TEAM-TASKS.md`。

## 开发前置门槛

1. 新项目或跨边界需求先完成需求澄清和设计批准，再写实现计划。
2. 多步骤实现优先使用独立 Git worktree；未建立隔离前不得开展大规模实现。
3. 新功能和 bug 修复遵循 TDD：先写失败测试，再实现最小行为，最后重构。
4. 遇到失败或异常先定位根因，不以猜测替代复现证据。
5. 完成前必须运行与改动直接相关的新鲜验证命令；未验证部分必须明确标注。
6. 涉及认证、隐私、数据迁移、公共 API、并发或发布的改动，必须由不同代理独立复核。

## Skill 路由

- Codex：`brainstorming` → `writing-plans` → `using-git-worktrees` → 按任务使用 `test-driven-development`、`systematic-debugging`、`requesting-code-review`、`verification-before-completion`。
- Reasonix：每次只加载与任务直接相关的 3–6 个规划/审查 skill；优先架构、API、安全、文档和代码审查能力。
- Kimi：每次只加载与任务直接相关的 3–6 个实现/测试 skill；优先 API、TDD、增量实现、调试和前端工程能力。

## 任务边界与交付

每个子任务必须写明：目标、输入文件、产出文件、不可修改范围、验收命令、完成标准和状态回写方式。任务应是可在一次会话内完成且可独立测试的 bounded task。

禁止把“完成整个项目”作为单个子代理任务。未经 Codex 集成和审查，子代理不得直接标记主线完成。

## Git 与安全

- 所有正式变更以 Git 提交为准，提交信息前缀使用 `codex:`、`reasonix:` 或 `kimi:`。
- 只提交源代码、文档、测试和必要配置模板；禁止提交密钥、个人凭据、会话日志和订单原始敏感材料。
- API 密钥必须通过环境变量或部署密钥管理注入，禁止写入仓库或协同文档。
- Windows 环境默认使用 PowerShell；依赖 Bash 的脚本必须在任务中明确替代方案。

## 当前技术基线

- 客户端：微信小程序。
- 后端：Node.js + TypeScript + NestJS，模块化单体优先。
- 部署：七牛云 VM。
- 数据库：PostgreSQL。
- 对象存储：七牛云 Kodo。
- Redis：MVP 暂不纳入，按实时通信、限流和并发验证结果再决定。
- 第三方打车：适配器 + 手动降级。

