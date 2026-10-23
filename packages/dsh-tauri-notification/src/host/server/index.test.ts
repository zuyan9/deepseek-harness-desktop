import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { server } from '.'
import { clearPushRuntime } from '../config/runtime'
import { handleSessionEvent } from '../events/session-event'
import { device } from '../service/device'
import { presence } from '../service/presence'
import { clearTurnEndFacts } from '../service/turn-end'
import { storage } from '../storage'

vi.mock('../storage', async () => {
  const { createStorage } = await import('unstorage')
  return { storage: createStorage() }
})

const turnEndPath = '/api/tauri/notification/turn-end'
const devicesPath = '/api/tauri/notification/push/devices'
const presencePath = '/api/tauri/notification/presence'
const token = 'ExponentPushToken[abc123]'
const disposers: Array<() => void | Promise<void>> = []
const workspaceRegistry = { archivedSessionIds: [] as string[] }

afterEach(async () => {
  for (const dispose of disposers.splice(0))
    await dispose()
  clearTurnEndFacts()
  clearPushRuntime()
  await storage.clear()
  workspaceRegistry.archivedSessionIds = []
})

async function mount() {
  const registered = new Map<string, WebRoute>()
  const unmount = server({
    workspaceRegistry,
    webServer: {
      register(route: WebRoute) {
        registered.set(route.path, route)
        return () => {
          registered.delete(route.path)
        }
      },
    },
  } as unknown as Context)
  disposers.push(unmount)
  const httpServer = createServer((request, response) => {
    const route = registered.get(new URL(request.url ?? '/', 'http://host.invalid').pathname)
    void Promise.resolve(route?.handler(request, response)).catch(() => {
      response.writeHead(500)
      response.end()
    })
  })
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
  disposers.push(() => new Promise<void>(resolve => httpServer.close(() => resolve())))
  const base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`
  return { registered, unmount, url: (path: string) => `${base}${path}` }
}

function send(url: string, method: string, body: unknown): Promise<Response> {
  return fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

it('注册三个精确路由，卸载后全部撤销', async () => {
  const { registered, unmount } = await mount()
  expect([...registered.keys()].sort()).toEqual([devicesPath, presencePath, turnEndPath].sort())
  expect([...registered.values()].every(route => route.kind === 'exact')).toBe(true)
  unmount()
  expect(registered.size).toBe(0)
})

it('serves turn-end facts and preserves HEAD, allowed methods', async () => {
  const { url } = await mount()
  const base = url(turnEndPath)
  expect(await (await fetch(base)).json()).toEqual({})
  handleSessionEvent({ id: 'session' }, { type: 'turn/end', data: { turn: 3, reason: { kind: 'aborted' } } })
  expect(await (await fetch(`${base}?sessionId=session`)).json()).toEqual({ reason: 'aborted', turn: 3 })
  handleSessionEvent({ id: 'session' }, { type: 'turn/end', data: { turn: 4, reason: { kind: 'completed' } } })
  workspaceRegistry.archivedSessionIds = ['session', 'without-fact']
  expect(await (await fetch(`${base}?sessionId=session`)).json()).toEqual({ reason: 'archived', turn: 4 })
  expect(await (await fetch(`${base}?sessionId=without-fact`)).json()).toEqual({ reason: 'archived', turn: -1 })
  workspaceRegistry.archivedSessionIds = []
  expect(await (await fetch(`${base}?sessionId=session`)).json()).toEqual({ reason: 'completed', turn: 4 })
  const head = await fetch(base, { method: 'HEAD' })
  expect(head.status).toBe(200)
  expect(await head.text()).toBe('')
  const options = await fetch(base, { method: 'OPTIONS' })
  expect(options.status).toBe(405)
  expect(options.headers.get('allow')?.split(', ').sort()).toEqual(['GET', 'HEAD'])
  const invalid = await fetch(base, { method: 'POST' })
  expect(invalid.status).toBe(405)
  expect(invalid.headers.get('allow')?.split(', ').sort()).toEqual(['GET', 'HEAD'])
})

it('登记手机用 PUT，注销用 DELETE', async () => {
  const { url } = await mount()
  const registered = await send(url(devicesPath), 'PUT', { token, platform: 'android', locale: 'en', origin: 'http://192.168.1.2:3088' })
  expect(registered.status).toBe(200)
  expect(await registered.json()).toEqual({ ok: true, delivering: true })
  expect(await device.list()).toEqual([{ token, platform: 'android', locale: 'en', origin: 'http://192.168.1.2:3088', updatedAt: expect.any(Number) }])
  const removed = await send(url(devicesPath), 'DELETE', { token })
  expect(removed.status).toBe(200)
  expect(await removed.json()).toEqual({ ok: true })
  expect(await device.list()).toEqual([])
})

it.each([
  ['token 格式不对', { token: 'fcm-raw-token', platform: 'ios', locale: 'zh', origin: 'https://harness.test' }],
  ['平台未知', { token, platform: 'web', locale: 'zh', origin: 'https://harness.test' }],
  ['语言未知', { token, platform: 'ios', locale: 'ko', origin: 'https://harness.test' }],
  ['origin 带路径', { token, platform: 'ios', locale: 'zh', origin: 'https://harness.test/app' }],
  ['origin 不是 http(s)', { token, platform: 'ios', locale: 'zh', origin: 'file:///etc' }],
])('登记手机时%s返回 400 且不落盘', async (_, body) => {
  const { url } = await mount()
  const response = await send(url(devicesPath), 'PUT', body)
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ ok: false, error: 'invalid-device' })
  expect(await device.list()).toEqual([])
})

it('注销时 token 不合法返回 400', async () => {
  const { url } = await mount()
  const response = await send(url(devicesPath), 'DELETE', { token: 'x' })
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ ok: false, error: 'invalid-device' })
})

it('设备路由只接受 PUT 与 DELETE', async () => {
  const { url } = await mount()
  const response = await fetch(url(devicesPath))
  expect(response.status).toBe(405)
  expect(response.headers.get('allow')?.split(', ').sort()).toEqual(['DELETE', 'PUT'])
})

it('presence 路由记下窗口是否可见', async () => {
  const { url } = await mount()
  const since = Date.now()
  const response = await send(url(presencePath), 'PUT', { clientId: 'desktop-1', visible: true })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
  expect(presence.peek(since)).toBe(true)
  await send(url(presencePath), 'PUT', { clientId: 'desktop-1', visible: false })
  expect(presence.peek(Date.now() + 1)).toBe(false)
})

it.each([
  ['缺少 clientId', { visible: true }],
  ['clientId 带非法字符', { clientId: 'a b', visible: true }],
  ['visible 不是布尔值', { clientId: 'desktop-1', visible: 'yes' }],
])('presence %s 时返回 400', async (_, body) => {
  const { url } = await mount()
  const response = await send(url(presencePath), 'PUT', body)
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ ok: false, error: 'invalid-presence' })
  expect(presence.peek(0)).toBe(false)
})
