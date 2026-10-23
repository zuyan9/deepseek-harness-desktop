import type { PendingPush } from '../types'

export const presences = new Map<string, number>()

export const pendingPushes = new Map<string, PendingPush>()

export const receiptChecks = new Set<ReturnType<typeof setTimeout>>()

export const pushRuntime = { generation: 0, delivering: true, deviceWrites: Promise.resolve() }

export function clearPushRuntime(): void {
  pendingPushes.forEach(pending => clearTimeout(pending.timer))
  pendingPushes.clear()
  receiptChecks.forEach(clearTimeout)
  receiptChecks.clear()
  presences.clear()
  pushRuntime.generation++
  pushRuntime.delivering = true
  pushRuntime.deviceWrites = Promise.resolve()
}
