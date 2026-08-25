/**
 * 后端错误码到用户可读文案的映射。
 *
 * 后端统一返回 { code, message, statusCode }，其中 message 多数情况下就是错误码本身
 * （如 TRIP_CAPACITY_INVALID），直接展示给用户不可读。这里集中做翻译。
 */
const ERROR_MESSAGES: Record<string, string> = {
  // 认证与权限
  AUTH_REQUIRED: '请先登录',
  FORBIDDEN: '没有权限执行该操作',
  PHONE_NOT_VERIFIED: '请先完成手机号验证',
  TRIP_MEMBER_REQUIRED: '只有行程成员可以执行该操作',
  ONLY_CREATOR_CAN_OPEN_RIDE: '只有发单人可以发起叫车',
  ONLY_CREATOR_CAN_UPDATE_VEHICLE: '只有发单人可以录入车辆信息',
  ONLY_CREATOR_CAN_SUBMIT_ORDER: '只有发单人可以提交订单',
  ONLY_CREATOR_CAN_SUBMIT_FARE: '只有发单人可以提交费用',

  // 请求参数
  BAD_REQUEST: '请求参数有误',
  IDEMPOTENCY_KEY_REQUIRED: '请求缺少幂等标识，请重试',
  IDEMPOTENCY_KEY_INVALID: '请求标识格式有误，请重试',
  ORIGIN_AND_DESTINATION_REQUIRED: '请填写出发地和目的地',
  DEPART_TIME_MUST_BE_FUTURE: '出发时间必须晚于当前时间',
  TRIP_CAPACITY_INVALID: '单车人数只能是 3 人或 4 人',
  JOIN_MEMBER_COUNT_INVALID: '一次最多加入 2 人',
  LIST_DATE_INVALID: '日期格式有误',
  LIST_TIME_INVALID: '时间格式有误',
  LIST_FEMALE_ONLY_INVALID: '筛选条件有误',

  // 行程状态
  TRIP_NOT_FOUND: '行程不存在或已被取消',
  TRIP_CAPACITY_EXCEEDED: '座位已满，换一个行程试试',
  TRIP_NOT_RECRUITING: '该行程已不在招募中',
  TRIP_NOT_READY_FOR_RIDE: '行程还未成团，暂时不能叫车',
  WITHDRAW_WINDOW_EXPIRED: '反悔时间已过，无法撤回',
  STATE_CONFLICT: '状态已变化，请刷新后重试',

  // 费用与订单
  FARE_ORDER_NOT_FOUND: '订单不存在',
  FARE_SETTLEMENT_LOCKED: '订单存在争议，结算已锁定',
  FARE_CONFIRMATION_WINDOW_EXPIRED: '确认时间已过，将转人工处理',
  FARE_AMOUNT_INVALID: '金额填写有误',
  PAYMENT_AMOUNT_INVALID: '支付金额填写有误',
  DISPUTE_REASON_REQUIRED: '请填写异议原因',
  SCREENSHOT_REQUIRED: '请上传订单截图',
  SCREENSHOT_FORMAT_NOT_ALLOWED: '截图仅支持 PNG、JPEG 或 WebP 格式',
  SCREENSHOT_SIZE_INVALID: '截图大小不能超过 10MB',
  PLATE_REQUIRED: '请填写车牌号',

  // 聊天
  MESSAGE_TEXT_REQUIRED: '请输入消息内容',
  MESSAGE_TEXT_TOO_LONG: '消息长度不能超过 500 字',
  MESSAGE_LIMIT_INVALID: '分页参数有误',
  MESSAGE_CURSOR_INVALID: '分页位置有误',
  TRIP_CHAT_CLOSED: '行程已归档，聊天已关闭',
  IDEMPOTENCY_KEY_CONFLICT: '该请求标识已被占用，请重试',

  // 安全与评价
  SOS_TRIP_REQUIRED: '请在具体行程中发起紧急求助',
  TRIP_NOT_REVIEWABLE: '当前行程还不能评价',

  // 通用
  NOT_FOUND: '内容不存在',
  RATE_LIMITED: '操作过于频繁，请稍后再试',
  PAYLOAD_TOO_LARGE: '内容过大，请精简后重试',
  INTERNAL_ERROR: '服务暂时不可用，请稍后再试',
  REQUEST_FAILED: '请求失败，请稍后再试',
  NETWORK_ERROR: '网络连接失败，请检查网络后重试',
}

const DEFAULT_MESSAGE = '请求失败，请稍后再试'

/** 把错误码翻译成用户可读文案；未知错误码回退到后端 message 或通用提示。 */
export function resolveErrorMessage(code: string, fallback?: string): string {
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  // 未收录的错误码：如果后端 message 不是错误码格式（含中文或空格），直接用它。
  if (fallback && !/^[A-Z][A-Z0-9_]*$/.test(fallback)) return fallback
  return DEFAULT_MESSAGE
}
