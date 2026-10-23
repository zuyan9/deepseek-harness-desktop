/** 路由契约：生成客户端据此产出 `Types.*`（形状校验仍在处理器内做）。 */

export interface GetTurnEndQuery {
  sessionId?: string
}

/** 会话最近一次回合结束的原因；宿主还没记录过该会话时字段缺省。 */
export interface TurnEndResult {
  reason?: string
  turn?: number
}

export interface PutPushDeviceBody {
  token?: string
  platform?: string
  locale?: string
  origin?: string
}

export interface DeletePushDeviceBody {
  token?: string
}

export interface PutPresenceBody {
  clientId?: string
  visible?: boolean
}

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface PushDeviceResult extends ActionResult {
  delivering?: boolean
}
