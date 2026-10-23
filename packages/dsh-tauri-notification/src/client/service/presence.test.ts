import { afterEach, describe, expect, it, vi } from 'vitest'
import { putPresence } from '../apis'
import { reportPresence } from './presence'

vi.mock('../apis', () => ({ putPresence: vi.fn() }))

describe('reportPresence', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('把 clientId 与可见性作为请求体发给宿主，默认不带 keepalive', async () => {
    vi.mocked(putPresence).mockResolvedValue({ ok: true })
    expect(await reportPresence({ clientId: 'c1', visible: true })).toEqual({ ok: true })
    expect(putPresence).toHaveBeenCalledExactlyOnceWith({ clientId: 'c1', visible: true }, { keepalive: false })
  })

  it('卸载场景透传 keepalive', async () => {
    vi.mocked(putPresence).mockResolvedValue({ ok: true })
    await reportPresence({ clientId: 'c1', visible: false, keepalive: true })
    expect(putPresence).toHaveBeenCalledExactlyOnceWith({ clientId: 'c1', visible: false }, { keepalive: true })
  })

  it('请求失败时返回错误而不是抛出', async () => {
    vi.mocked(putPresence).mockRejectedValue(new Error('offline'))
    expect(await reportPresence({ clientId: 'c1', visible: true })).toEqual({ ok: false, error: 'offline' })
  })
})
