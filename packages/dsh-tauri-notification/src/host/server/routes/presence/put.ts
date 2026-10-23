import type { EventHandlerRequest } from 'h3'
import type { ActionResult, PutPresenceBody } from '../index.types'
import { defineEventHandler, readBody } from 'h3'
import { presence } from '../../../service/presence'

const CLIENT_ID_PATTERN = /^[\w-]{1,64}$/

export default defineEventHandler<EventHandlerRequest, Promise<ActionResult>>(async (event) => {
  const body = await readBody<PutPresenceBody>(event)
  if (typeof body?.clientId !== 'string' || !CLIENT_ID_PATTERN.test(body.clientId) || typeof body.visible !== 'boolean') {
    event.res.status = 400
    return { ok: false, error: 'invalid-presence' }
  }
  presence.update(body.clientId, body.visible)
  return { ok: true }
})
