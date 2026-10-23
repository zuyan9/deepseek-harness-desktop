import type { HostContext } from 'dsh-tauri'
import type { PushNotice } from '../types'
import type { ExpoPushMessage } from './push.types'
import { getServerContext } from 'dsh-h3/utils'
import { defineService } from 'dsh-tauri'
import { PLUGIN_ID } from '../../shared/constants'
import { pendingPushes, pushRuntime, receiptChecks } from '../config/runtime'
import { server } from '../server'
import { device } from './device'
import { presence } from './presence'
import { pushMessagesOf, ticketOutcomeOf, unregisteredReceiptTokensOf } from './push.utils'

const PUSH_DELAY_MS = 10_000
const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const RECEIPT_DELAY_MS = 15 * 60 * 1000
const SEND_ATTEMPTS = 3
const RETRY_BASE_MS = 1_000
const REQUEST_TIMEOUT_MS = 15_000
const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'

export const push = defineService({
  schedule(sessionId: string, notice: PushNotice): void {
    clearPending(sessionId)
    const scheduledAt = Date.now()
    const generation = pushRuntime.generation
    const timer = setTimeout(() => {
      pendingPushes.delete(sessionId)
      deliver(sessionId, notice, scheduledAt, generation).catch(error => warn(`push delivery failed: ${messageOf(error)}`, generation))
    }, PUSH_DELAY_MS)
    timer.unref?.()
    pendingPushes.set(sessionId, { notice, timer })
  },
  cancel(sessionId: string, key?: string): void {
    const pending = pendingPushes.get(sessionId)
    if (pending && (key === undefined || pending.notice.key === key))
      clearPending(sessionId)
  },
  peek(): boolean {
    return pushRuntime.delivering
  },
})

// --- internal ---

function clearPending(sessionId: string): void {
  const pending = pendingPushes.get(sessionId)
  if (!pending)
    return
  clearTimeout(pending.timer)
  pendingPushes.delete(sessionId)
}

async function deliver(sessionId: string, notice: PushNotice, scheduledAt: number, generation: number): Promise<void> {
  const ctx = getServerContext<HostContext>(server)
  const archivedSessionIds: readonly string[] | undefined = ctx.workspaceRegistry?.archivedSessionIds
  if (archivedSessionIds?.includes(sessionId) || presence.peek(scheduledAt))
    return
  const now = Date.now()
  const devices = await device.list()
  const active = devices.filter(entry => now - entry.updatedAt <= DEVICE_TTL_MS)
  if (active.length < devices.length)
    await device.remove(devices.filter(entry => !active.includes(entry)).map(entry => entry.token))
  if (active.length === 0 || generation !== pushRuntime.generation)
    return
  const messages = pushMessagesOf(active, { sessionId, kind: notice.kind, detail: notice.detail, title: titleOf(ctx, notice.session), sequence: scheduledAt })
  const payload = await request(EXPO_SEND_URL, messages, generation)
  if (generation !== pushRuntime.generation)
    return
  pushRuntime.delivering = payload !== undefined
  if (payload === undefined)
    return
  const outcome = ticketOutcomeOf(messages, payload)
  await device.remove(outcome.unregistered)
  if (outcome.receipts.size > 0)
    checkReceipts(outcome.receipts, generation)
}

function checkReceipts(receipts: ReadonlyMap<string, string>, generation: number): void {
  const timer = setTimeout(() => {
    receiptChecks.delete(timer)
    void (async () => {
      const payload = await request(EXPO_RECEIPTS_URL, { ids: [...receipts.keys()] }, generation)
      if (payload !== undefined && generation === pushRuntime.generation)
        await device.remove(unregisteredReceiptTokensOf(payload, receipts))
    })().catch(error => warn(`push receipt check failed: ${messageOf(error)}`, generation))
  }, RECEIPT_DELAY_MS)
  timer.unref?.()
  receiptChecks.add(timer)
}

async function request(url: string, body: readonly ExpoPushMessage[] | { ids: string[] }, generation: number): Promise<unknown> {
  let failure = ''
  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
    if (attempt > 0)
      await new Promise(resolve => setTimeout(resolve, RETRY_BASE_MS * 2 ** (attempt - 1)))
    if (generation !== pushRuntime.generation)
      return undefined
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'accept': 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.ok)
        return await response.json()
      failure = `HTTP ${response.status}`
      if (response.status !== 429 && response.status < 500)
        break
    }
    catch (error) {
      failure = messageOf(error)
    }
  }
  warn(`Expo push request failed: ${failure}`, generation)
  return undefined
}

function warn(message: string, generation: number): void {
  if (generation === pushRuntime.generation)
    getServerContext<HostContext>(server).logger?.warn?.(`[${PLUGIN_ID}] ${message}`)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function titleOf(ctx: HostContext, session: unknown): string | undefined {
  try {
    const projected = (ctx.get?.('sessionProjections') as { stateOf?: (session: unknown, key: string) => unknown } | undefined)?.stateOf?.(session, 'title')
    if (typeof projected === 'string' && projected.trim())
      return projected
    const folded = (ctx.get?.('sessionTitle') as { get?: (session: unknown) => { title?: unknown } | undefined } | undefined)?.get?.(session)?.title
    return typeof folded === 'string' ? folded : undefined
  }
  catch {
    return undefined
  }
}
