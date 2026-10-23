import type { HostContext } from 'dsh-tauri'
import { PLUGIN_ID } from '../shared/constants'
import { clearPushRuntime } from './config/runtime'
import { handleSessionEvent } from './events/session-event'
import { server } from './server'
import { clearTurnEndFacts } from './service/turn-end'

export function apply(ctx: HostContext): void {
  ctx.effect(() => server(ctx), `${PLUGIN_ID}: routes`)
  ctx.effect(() => () => clearTurnEndFacts(), `${PLUGIN_ID}: host runtime`)
  ctx.effect(() => clearPushRuntime, `${PLUGIN_ID}: push runtime`)

  ctx.on('session/event', handleSessionEvent)
}
