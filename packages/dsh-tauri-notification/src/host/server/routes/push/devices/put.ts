import type { EventHandlerRequest } from 'h3'
import type { PushDeviceResult, PutPushDeviceBody } from '../../index.types'
import { defineEventHandler, readBody } from 'h3'
import { device } from '../../../../service/device'
import { push } from '../../../../service/push'
import { isPushLocale, isPushOrigin, isPushPlatform, isPushToken } from '../../../../utils/device'

export default defineEventHandler<EventHandlerRequest, Promise<PushDeviceResult>>(async (event) => {
  const body = await readBody<PutPushDeviceBody>(event)
  if (!isPushToken(body?.token) || !isPushPlatform(body.platform) || !isPushLocale(body.locale) || !isPushOrigin(body.origin)) {
    event.res.status = 400
    return { ok: false, error: 'invalid-device' }
  }
  await device.save({ token: body.token, platform: body.platform, locale: body.locale, origin: body.origin, updatedAt: Date.now() })
  return { ok: true, delivering: push.peek() }
})
