import type { PushDevice, PushLocale } from '../types'
import type { ExpoPushMessage, PushMessageInput, PushTicketOutcome } from './push.types'
import { boundText } from '../utils/text'

const PUSH_CHANNEL = 'dsh-bridge'
const TITLE_LIMIT = 120
const BODY_LIMIT = 200
const UNREGISTERED = 'DeviceNotRegistered'

const PUSH_TEXT: Record<PushLocale, Record<'session' | 'turn' | 'approval' | 'question', string>> = {
  zh: { session: 'DSH 会话', turn: '轮次已完成', approval: '需要授权', question: '需要回答' },
  en: { session: 'DSH session', turn: 'Turn completed', approval: 'Approval required', question: 'Answer required' },
}

export function pushMessagesOf(devices: readonly PushDevice[], input: PushMessageInput): ExpoPushMessage[] {
  const tag = `${input.kind === 'turn' ? 'dsh-notification' : 'dsh-notification-pending'}-${input.sessionId}-${input.sequence}`
  return devices.map((device) => {
    const text = PUSH_TEXT[device.locale]
    const title = boundText(input.title?.trim() || text.session, TITLE_LIMIT)
    const label = text[input.kind]
    const detail = input.detail.trim()
    return {
      to: device.token,
      title,
      body: boundText(detail ? `${label} · ${detail}` : label, BODY_LIMIT),
      sound: 'default',
      priority: 'high',
      channelId: PUSH_CHANNEL,
      data: { origin: device.origin, sessionId: input.sessionId, title, tag },
    }
  })
}

export function ticketOutcomeOf(messages: readonly ExpoPushMessage[], payload: unknown): PushTicketOutcome {
  const outcome: PushTicketOutcome = { unregistered: [], receipts: new Map() }
  const tickets = recordOf(payload)?.data
  if (!Array.isArray(tickets))
    return outcome
  tickets.forEach((ticket, index) => {
    const token = messages[index]?.to
    const entry = recordOf(ticket)
    if (!token || !entry)
      return
    if (entry.status === 'ok' && typeof entry.id === 'string')
      outcome.receipts.set(entry.id, token)
    else if (entry.status === 'error' && recordOf(entry.details)?.error === UNREGISTERED)
      outcome.unregistered.push(token)
  })
  return outcome
}

export function unregisteredReceiptTokensOf(payload: unknown, receipts: ReadonlyMap<string, string>): string[] {
  const entries = recordOf(recordOf(payload)?.data)
  if (!entries)
    return []
  const tokens: string[] = []
  for (const [id, receipt] of Object.entries(entries)) {
    const entry = recordOf(receipt)
    const token = receipts.get(id)
    if (token && entry?.status === 'error' && recordOf(entry.details)?.error === UNREGISTERED)
      tokens.push(token)
  }
  return tokens
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
