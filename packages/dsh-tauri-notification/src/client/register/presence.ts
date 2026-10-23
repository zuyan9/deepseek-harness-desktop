import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { PRESENCE_HEARTBEAT_MS } from '../../shared/constants'
import { reportPresence } from '../service/presence'

export const presenceFeature = defineRegister<ClientContext>((controller) => {
  // Why: DSH Mobile hides foreground pushes natively, and iOS can suspend its WebView before it reports going hidden.
  if (typeof document === 'undefined' || 'ReactNativeWebView' in window)
    return
  const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const report = (): void => {
    void reportPresence({ clientId, visible: document.visibilityState === 'visible' })
  }
  report()
  controller.listen('visibilitychange', report)
  controller.listenWindow('pagehide', () => {
    void reportPresence({ clientId, visible: false, keepalive: true })
  })
  controller.interval(() => {
    if (document.visibilityState === 'visible')
      report()
  }, PRESENCE_HEARTBEAT_MS)
  controller.add(() => {
    void reportPresence({ clientId, visible: false })
  })
})
