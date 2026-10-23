import type { PushKind } from '../types'

export interface PushMessageInput {
  sessionId: string
  kind: PushKind
  detail: string
  title: string | undefined
  sequence: number
}

export interface ExpoPushMessage {
  to: string
  title: string
  body: string
  sound: 'default'
  priority: 'high'
  channelId: string
  data: {
    origin: string
    sessionId: string
    title: string
    tag: string
  }
}

export interface PushTicketOutcome {
  unregistered: string[]
  receipts: Map<string, string>
}
