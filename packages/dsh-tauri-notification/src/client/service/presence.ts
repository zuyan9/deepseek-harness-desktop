import { putPresence } from '../apis'

export async function reportPresence(input: { clientId: string, visible: boolean, keepalive?: boolean }): Promise<{ ok: boolean, error?: string }> {
  try {
    await putPresence({ clientId: input.clientId, visible: input.visible }, { keepalive: input.keepalive === true })
    return { ok: true }
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
