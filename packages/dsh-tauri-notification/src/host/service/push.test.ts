import type { Context } from '@deepseek-ai/cordis'
import type { PushDevice, PushNotice } from '../types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPushRuntime } from '../config/runtime'
import { server } from '../server'
import { storage } from '../storage'
import { device } from './device'
import { presence } from './presence'
import { push } from './push'

vi.mock('../storage', async () => {
  const { createStorage } = await import('unstorage')
  return { storage: createStorage() }
})

const SEND_URL = 'https://exp.host/--/api/v2/push/send'
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const start = Date.UTC(2026, 9, 23)
const session = { id: 's1' }
const turn: PushNotice = { kind: 'turn', key: '', detail: '', session }
const workspaceRegistry = { archivedSessionIds: [] as string[] }
const logger = { warn: vi.fn<(message: string) => void>() }
const fetchMock = vi.fn<typeof fetch>()
let disposeServer: () => void

function phone(name: string, updatedAt = start, overrides: Partial<PushDevice> = {}): PushDevice {
  return { token: `ExponentPushToken[${name}]`, platform: 'ios', locale: 'zh', origin: 'https://harness.test:3080', updatedAt, ...overrides }
}

function respond(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function sentBodies(url = SEND_URL): unknown[] {
  return fetchMock.mock.calls.filter(([target]) => target === url).map(([, init]) => JSON.parse(String(init?.body)))
}

async function settle(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await new Promise(resolve => setImmediate(resolve))
}

describe('push', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(start)
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(respond(200, { data: [{ status: 'ok', id: 'r1' }] }))
    workspaceRegistry.archivedSessionIds = []
    disposeServer = server({
      workspaceRegistry,
      logger,
      webServer: { register: () => () => {} },
      get: (name: string) => name === 'sessionTitle' ? { get: (target: unknown) => target === session ? { title: '修复登录' } : undefined } : undefined,
    } as unknown as Context)
  })

  afterEach(async () => {
    clearPushRuntime()
    disposeServer()
    await storage.clear()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('调度 10 秒后把推送发给所有已登记的设备', async () => {
    await device.save(phone('a'))
    await device.save(phone('b', start, { locale: 'en' }))
    push.schedule('s1', turn)
    await settle(9_999)
    expect(fetchMock).not.toHaveBeenCalled()
    await settle(1)
    expect(sentBodies()).toEqual([[
      expect.objectContaining({ to: 'ExponentPushToken[b]', title: '修复登录', body: 'Turn completed', channelId: 'dsh-bridge' }),
      expect.objectContaining({ to: 'ExponentPushToken[a]', title: '修复登录', body: '轮次已完成', data: expect.objectContaining({ origin: 'https://harness.test:3080', sessionId: 's1' }) }),
    ]])
  })

  it('标题优先取会话投影，投影不可用时退回标题服务，都失败时用兜底标题照发', async () => {
    await device.save(phone('a'))
    disposeServer()
    const projections = { stateOf: vi.fn<(target: unknown, key: string) => unknown>(() => '投影标题') }
    disposeServer = server({
      workspaceRegistry,
      logger,
      webServer: { register: () => () => {} },
      get: (name: string) => name === 'sessionProjections' ? projections : undefined,
    } as unknown as Context)
    push.schedule('s1', turn)
    await settle(10_000)
    expect(projections.stateOf).toHaveBeenCalledWith(session, 'title')
    projections.stateOf.mockImplementation(() => {
      throw new Error('projection key missing')
    })
    push.schedule('s1', turn)
    await settle(10_000)
    expect(sentBodies().map(body => (body as Array<{ title: string }>)[0]?.title)).toEqual(['投影标题', 'DSH 会话'])
  })

  it('延迟期内取消就不再发送', async () => {
    await device.save(phone('a'))
    push.schedule('s1', turn)
    await settle(5_000)
    push.cancel('s1')
    await settle(10_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('带 key 的取消只撤掉同一条推送', async () => {
    await device.save(phone('a'))
    push.schedule('s1', { kind: 'approval', key: 'a1', detail: 'shell', session })
    push.cancel('s1', 'a2')
    await settle(10_000)
    expect(sentBodies()).toHaveLength(1)
    push.schedule('s1', { kind: 'approval', key: 'a1', detail: 'shell', session })
    push.cancel('s1', 'a1')
    await settle(10_000)
    expect(sentBodies()).toHaveLength(1)
  })

  it('同一会话重复调度只发最后一条', async () => {
    await device.save(phone('a'))
    push.schedule('s1', turn)
    await settle(3_000)
    push.schedule('s1', { kind: 'question', key: 'c1', detail: '要发布吗？', session })
    await settle(10_000)
    expect(sentBodies()).toEqual([[expect.objectContaining({ body: '需要回答 · 要发布吗？' })]])
  })

  it('调度之后有窗口可见就不推送', async () => {
    await device.save(phone('a'))
    push.schedule('s1', turn)
    await settle(4_000)
    presence.update('desktop', true)
    await settle(6_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('调度之前就转入后台的窗口不影响推送', async () => {
    await device.save(phone('a'))
    presence.update('desktop', true)
    await settle(1_000)
    presence.update('desktop', false)
    await settle(1)
    push.schedule('s1', turn)
    await settle(10_000)
    expect(sentBodies()).toHaveLength(1)
  })

  it('已归档的会话不推送', async () => {
    await device.save(phone('a'))
    push.schedule('s1', turn)
    workspaceRegistry.archivedSessionIds = ['s1']
    await settle(10_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('没有登记设备时不发请求', async () => {
    push.schedule('s1', turn)
    await settle(10_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('30 天没刷新过的设备被清掉且不再推送', async () => {
    await device.save(phone('stale', start - 31 * 24 * 60 * 60 * 1000))
    await device.save(phone('fresh', start - 24 * 60 * 60 * 1000))
    push.schedule('s1', turn)
    await settle(10_000)
    expect(sentBodies()).toEqual([[expect.objectContaining({ to: 'ExponentPushToken[fresh]' })]])
    expect((await device.list()).map(entry => entry.token)).toEqual(['ExponentPushToken[fresh]'])
  })

  it('回执是 DeviceNotRegistered 时删掉对应设备', async () => {
    await device.save(phone('gone'))
    await device.save(phone('alive', start + 1))
    fetchMock.mockResolvedValueOnce(respond(200, { data: [{ status: 'ok', id: 'r1' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }))
    push.schedule('s1', turn)
    await settle(10_000)
    expect((await device.list()).map(entry => entry.token)).toEqual(['ExponentPushToken[alive]'])
  })

  it('429 与 5xx 按 1 秒、2 秒退避重试，第三次成功即止', async () => {
    await device.save(phone('a'))
    fetchMock.mockResolvedValueOnce(respond(429)).mockResolvedValueOnce(respond(503))
    push.schedule('s1', turn)
    await settle(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await settle(1_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await settle(2_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('三次都失败时记一条警告', async () => {
    await device.save(phone('a'))
    fetchMock.mockRejectedValue(new Error('network down'))
    push.schedule('s1', turn)
    await settle(13_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith('[dsh-tauri-notification] Expo push request failed: network down')
  })

  it('最近一次发送是否成功由 peek 报告，成功后恢复', async () => {
    await device.save(phone('a'))
    expect(push.peek()).toBe(true)
    fetchMock.mockRejectedValueOnce(new Error('blocked')).mockRejectedValueOnce(new Error('blocked')).mockRejectedValueOnce(new Error('blocked'))
    push.schedule('s1', turn)
    await settle(13_000)
    expect(push.peek()).toBe(false)
    push.schedule('s1', turn)
    await settle(10_000)
    expect(push.peek()).toBe(true)
  })

  it('读设备表出错时只记警告，不留下未处理的 rejection', async () => {
    await device.save(phone('a'))
    vi.spyOn(storage, 'getItem').mockRejectedValueOnce(new Error('EACCES'))
    push.schedule('s1', turn)
    await settle(10_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith('[dsh-tauri-notification] push delivery failed: EACCES')
  })

  it('4xx 不重试', async () => {
    await device.save(phone('a'))
    fetchMock.mockResolvedValue(respond(400, { errors: [{ code: 'VALIDATION_ERROR' }] }))
    push.schedule('s1', turn)
    await settle(20_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith('[dsh-tauri-notification] Expo push request failed: HTTP 400')
  })

  it('15 分钟后查收据，并删掉已卸载 App 的设备', async () => {
    await device.save(phone('a'))
    push.schedule('s1', turn)
    await settle(10_000)
    fetchMock.mockResolvedValueOnce(respond(200, { data: { r1: { status: 'error', details: { error: 'DeviceNotRegistered' } } } }))
    await settle(15 * 60 * 1000 - 1)
    expect(sentBodies(RECEIPTS_URL)).toEqual([])
    await settle(1)
    expect(sentBodies(RECEIPTS_URL)).toEqual([{ ids: ['r1'] }])
    expect(await device.list()).toEqual([])
  })

  it('运行态清空后，在途的推送与收据检查都不再触发', async () => {
    await device.save(phone('a'))
    push.schedule('s1', turn)
    clearPushRuntime()
    await settle(20 * 60 * 1000)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
