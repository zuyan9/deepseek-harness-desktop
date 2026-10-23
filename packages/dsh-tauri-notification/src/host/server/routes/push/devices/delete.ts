import type { EventHandlerRequest } from 'h3'
import type { ActionResult, DeletePushDeviceBody } from '../../index.types'
import { defineEventHandler, readBody } from 'h3'
import { device } from '../../../../service/device'
import { isPushToken } from '../../../../utils/device'

export default defineEventHandler<EventHandlerRequest, Promise<ActionResult>>(async (event) => {
  const body = await readBody<DeletePushDeviceBody>(event)
  if (!isPushToken(body?.token)) {
    event.res.status = 400
    return { ok: false, error: 'invalid-device' }
  }
  await device.remove([body.token])
  return { ok: true }
})
