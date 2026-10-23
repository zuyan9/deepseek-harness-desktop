import { defineService } from 'dsh-tauri'
import { PRESENCE_HEARTBEAT_MS } from '../../shared/constants'
import { presences } from '../config/runtime'

const PRESENCE_TTL_MS = PRESENCE_HEARTBEAT_MS * 2.5
const PRESENCE_RETENTION_MS = 60 * 60 * 1000
const PRESENCE_LIMIT = 64

export const presence = defineService({
  update(clientId: string, visible: boolean): void {
    const now = Date.now()
    const previous = presences.get(clientId) ?? Number.NEGATIVE_INFINITY
    presences.delete(clientId)
    presences.set(clientId, visible ? now + PRESENCE_TTL_MS : Math.min(previous, now))
    for (const [id, visibleUntil] of presences) {
      if (presences.size > PRESENCE_LIMIT || visibleUntil < now - PRESENCE_RETENTION_MS)
        presences.delete(id)
    }
  },
  peek(since: number): boolean {
    for (const visibleUntil of presences.values()) {
      if (visibleUntil >= since)
        return true
    }
    return false
  },
})
