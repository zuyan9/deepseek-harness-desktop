import { push } from '../service/push'
import { recordTurnEnd } from '../service/turn-end'
import { boundText } from '../utils/text'

const USER_INTERRUPT_REASONS: ReadonlySet<string> = new Set(['aborted', 'interrupted'])
const ASK_USER_QUESTION_TOOL = 'ask_user_question'
const REASON_CLAUSE_DELIMITER = /[：:。\n]/
const REASON_LIMIT = 60

/**
 * `session/event` 订阅：`turn/end` 记下结束原因，并按回合结束、授权、提问调度手机推送。
 *
 * 原因缺失时记成空原因而不是直接返回：空原因在客户端不算中断，于是退化成「照常通知」；
 * 直接返回会把上一回合的旧原因留在表里，那个旧原因若是 `aborted`，就会把这一回合的通知也一并吞掉。
 */
export function handleSessionEvent(session: any, event: any): void {
  const sessionId = session?.id
  if (typeof sessionId !== 'string' || sessionId.length === 0)
    return
  const data = event?.data
  switch (event?.type) {
    case 'turn/end': {
      const reason = typeof data?.reason?.kind === 'string' ? data.reason.kind : ''
      recordTurnEnd(sessionId, { reason, turn: typeof data?.turn === 'number' ? data.turn : -1 })
      if (isSubagent(session) || USER_INTERRUPT_REASONS.has(reason))
        push.cancel(sessionId)
      else
        push.schedule(sessionId, { kind: 'turn', key: '', detail: '', session })
      return
    }
    case 'turn/start':
    case 'user/message':
      push.cancel(sessionId)
      return
    case 'approval/asked':
      if (!isSubagent(session))
        push.schedule(sessionId, { kind: 'approval', key: String(data?.id ?? ''), detail: approvalDetail(data?.toolName, data?.reason), session })
      return
    case 'approval/decided':
      push.cancel(sessionId, String(data?.id ?? ''))
      return
    case 'tool/call':
      if (data?.name === ASK_USER_QUESTION_TOOL && !isSubagent(session))
        push.schedule(sessionId, { kind: 'question', key: String(data?.callId ?? ''), detail: questionDetail(data?.arguments), session })
      return
    case 'tool/result':
      push.cancel(sessionId, String(data?.message?.toolCallId ?? data?.callId ?? ''))
  }
}

function isSubagent(session: any): boolean {
  return session?.summary?.origin === 'subagent' || session?.header?.origin === 'subagent'
}

function approvalDetail(toolName: unknown, reason: unknown): string {
  const tool = typeof toolName === 'string' ? toolName.trim() : ''
  const clause = typeof reason === 'string' ? boundText(reason.split(REASON_CLAUSE_DELIMITER)[0]?.trim() ?? '', REASON_LIMIT) : ''
  return tool && clause ? `${tool}: ${clause}` : tool || clause
}

function questionDetail(raw: unknown): string {
  if (typeof raw !== 'string')
    return ''
  try {
    const first = JSON.parse(raw)?.questions?.[0]
    const text = typeof first?.question === 'string' && first.question.trim() ? first.question : first?.header
    return typeof text === 'string' ? text.trim() : ''
  }
  catch {
    return ''
  }
}
