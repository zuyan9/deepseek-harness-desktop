import type { PushDevice } from '../types'
import { defineService } from 'dsh-tauri'
import { pushRuntime } from '../config/runtime'
import { storage } from '../storage'
import { isPushLocale, isPushOrigin, isPushPlatform, isPushToken } from '../utils/device'

const DEVICES_KEY = 'devices.json'
const DEVICE_LIMIT = 20

export const device = defineService({
  async list(): Promise<PushDevice[]> {
    await pushRuntime.deviceWrites
    return readDevices()
  },
  async save(record: PushDevice): Promise<void> {
    await writeDevices(devices => [record, ...devices.filter(entry => entry.token !== record.token)])
  },
  async remove(tokens: readonly string[]): Promise<void> {
    if (tokens.length === 0)
      return
    await writeDevices(devices => devices.filter(entry => !tokens.includes(entry.token)))
  },
})

// --- internal ---

async function readDevices(): Promise<PushDevice[]> {
  const raw = await storage.getItem<{ version?: unknown, devices?: unknown }>(DEVICES_KEY)
  if (raw?.version !== 1 || !Array.isArray(raw.devices))
    return []
  const latest = new Map<string, PushDevice>()
  for (const entry of raw.devices) {
    if (!isPushDevice(entry))
      continue
    const previous = latest.get(entry.token)
    if (!previous || entry.updatedAt > previous.updatedAt)
      latest.set(entry.token, entry)
  }
  return [...latest.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, DEVICE_LIMIT)
}

function writeDevices(update: (devices: PushDevice[]) => PushDevice[]): Promise<void> {
  const write = pushRuntime.deviceWrites.then(async () => {
    const devices = update(await readDevices()).slice(0, DEVICE_LIMIT)
    await storage.setItem(DEVICES_KEY, `${JSON.stringify({ version: 1, devices }, null, 2)}\n`)
  })
  pushRuntime.deviceWrites = write.catch(() => {})
  return write
}

function isPushDevice(value: unknown): value is PushDevice {
  if (typeof value !== 'object' || value === null)
    return false
  const entry = value as Record<string, unknown>
  return isPushToken(entry.token) && isPushPlatform(entry.platform) && isPushLocale(entry.locale)
    && isPushOrigin(entry.origin) && typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
}
