# 同路行 Web/PWA 前端设计

**状态：** 已批准，2026-08-24  
**范围：** 手机优先 P0 前端完整骨架，不连接真实数据库或第三方生产能力。

## 目标

在 `apps/web` 提供可独立运行的 Vue 单页应用，完整演示同路行 P0 路径：登录、行程浏览/发布/申请、聊天、全员确认与 15 秒反悔、我的出行、叫车降级、车辆、订单/争议、费用、评价、SOS、联系人和个人页。页面先使用类型化 Mock API；切换 NestJS 时只替换 Adapter。

## 技术与边界

- Vue 3、Vite、TypeScript、Vue Router、Vant、Pinia、vite-plugin-pwa；不加入 Vuex、Tailwind、axios 或未经确认的 SDK。
- `src/api/contracts.ts` 定义 DTO；`src/api/client.ts` 是唯一 API 门面；`mock-client.ts` 供开发，`http-client.ts` 预留 Cookie 请求。
- Pinia 只保存 UI、展示用户和 mock 业务数据；禁止保存 token、手机号原文、SOS 位置、订单截图数据。
- 所有写操作传 `createIdempotencyKey()`；Mock 层模拟网络错误、容量冲突和状态冲突。
- PWA 仅预缓存构建静态资源，运行时不缓存 API、Socket、截图、手机号或 SOS 数据。
- 无地图、定位、叫车 Deep Link 或浏览器能力时，展示手动输入/复制路线/手动打开 App；不得声称唤起、报警或通知成功。

## 信息架构

```text
AppShell
├─ 首页 /trips                行程列表、日期、筛选、推荐原因
├─ 发布 /trips/create         发布行程表单
├─ 我的出行 /my-trips         发布/加入分栏与状态卡片
├─ 我的 /profile              个人主页、紧急联系人入口
└─ /login、/trips/:id、/trips/:id/chat、/trips/:id/ride
   /trips/:id/order、/trips/:id/review、/sos、/contacts
```

桌面端使用受限宽度主内容列和辅助面板；手机端为单列、底部导航和固定安全区主操作。核心业务列最大 720px。

## 关键交互

1. 未登录可浏览；发布、申请、聊天、确认保存 `redirect` 后登录回跳。
2. 列表只展示 `RECRUITING` 行程，显示最多三条推荐理由、人数和筛选；加载、空、失败都有恢复动作。
3. 发布仅允许总人数 3/4，申请仅 1/2 席；详情底部弹层申请；Adapter 的 `409` 需刷新状态并提示。
4. 最后活动成员确认后显示 15 秒倒计时与撤回；撤回后由 API 返回招募中和释放结果，前端不自行裁决最终状态。
5. 叫车先展示免责声明；失败时复制路线并引导手动打开。订单上传仅是 UI/文件元数据占位，未接 Kodo。
6. SOS 长按/确认后仅写 Mock 事件，显示位置结果、联系人、`tel:` 手动拨号；不自动短信或报警。

## 视觉与移动规范

- 深墨蓝 `#13233A`、夜行蓝 `#245C9C`、路灯橙 `#F5A623`、雾白 `#F6F8FB`、警示红 `#D9485F`；橙色只用于关键行动和倒计时。
- 320–767px 单列；768–1023px 平板；≥1024px 两/三栏。最小触控目标 44×44px，主要按钮 48px。
- 使用 `100dvh`、`env(safe-area-inset-bottom)` 和 `visualViewport` 处理底栏、聊天输入与键盘；抽屉/对话框锁定焦点和背景滚动，支持 Escape/返回。
- 状态不只依赖颜色；所有动作有文字和 aria 标签，支持减少动效偏好。

## 验收

1. typecheck、单测、build 通过。
2. Adapter/store 的容量、幂等键、确认/撤回状态和错误映射有单测。
3. 浏览器冒烟覆盖 320、375、414px 和桌面：登录回跳、筛选、发布、申请、确认/撤回、SOS、叫车降级。
4. 产物包含 manifest 与 service worker；构建配置不添加 API/敏感数据运行时缓存。
5. 真实 API、短信、Kodo、高德和 Socket.IO 均保留可替换契约接口，不宣称已接入。
