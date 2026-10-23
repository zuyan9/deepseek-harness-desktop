import type { PushDevice } from '../types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearPushRuntime } from '../config/runtime'
import { storage } from '../storage'
import { device } from './device'

vi.mock('../storage', async () => {
  const { createStorage } = await import('unstorage')
  return { storage: createStorage() }
})

function record(name: string, updatedAt: number, overrides: Partial<PushDevice> = {}): PushDevice {
  return { token: `ExponentPushToken[${name}]`, platform: 'ios', locale: 'zh', origin: 'https://harness.test:3080', updatedAt, ...overrides }
}

describe('device', () => {
  afterEach(async () => {
    await storage.clear()
    clearPushRuntime()
  })

  it('save 按 token 去重，并把最新登记的排在最前', async () => {
    await device.save(record('a', 1))
    await device.save(record('b', 2))
    await device.save(record('a', 3, { locale: 'en' }))
    expect(await device.list()).toEqual([record('a', 3, { locale: 'en' }), record('b', 2)])
  })

  it('remove 只删除指定的 token', async () => {
    await device.save(record('a', 1))
    await device.save(record('b', 2))
    await device.remove(['ExponentPushToken[a]'])
    expect(await device.list()).toEqual([record('b', 2)])
  })

  it('落盘格式带版本号', async () => {
    await device.save(record('a', 1))
    expect(await storage.getItem('devices.json')).toEqual({ version: 1, devices: [record('a', 1)] })
  })

  it('版本不符或内容损坏时当作没有设备', async () => {
    await storage.setItem('devices.json', JSON.stringify({ version: 2, devices: [record('a', 1)] }))
    expect(await device.list()).toEqual([])
    await storage.setItem('devices.json', 'not json')
    expect(await device.list()).toEqual([])
  })

  it('丢弃字段不合法的条目', async () => {
    await storage.setItem('devices.json', JSON.stringify({
      version: 1,
      devices: [
        record('ok', 1),
        record('bad-origin', 2, { origin: 'https://harness.test:3080/path' }),
        record('bad-platform', 3, { platform: 'web' as PushDevice['platform'] }),
        { ...record('bad-time', 4), updatedAt: 'now' },
        { ...record('x', 5), token: 'not-a-token' },
      ],
    }))
    expect(await device.list()).toEqual([record('ok', 1)])
  })

  it('最多保留 20 台设备，挤掉最早登记的', async () => {
    for (let index = 0; index < 21; index++)
      await device.save(record(`d${index}`, index))
    const tokens = (await device.list()).map(entry => entry.token)
    expect(tokens).toHaveLength(20)
    expect(tokens).not.toContain('ExponentPushToken[d0]')
    expect(tokens[0]).toBe('ExponentPushToken[d20]')
  })

  it('并发写入串行执行，互不覆盖', async () => {
    await Promise.all([device.save(record('a', 1)), device.save(record('b', 2)), device.remove(['ExponentPushToken[a]'])])
    expect(await device.list()).toEqual([record('b', 2)])
  })
})
