// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { presenceFeature } from './presence'

const mocks = vi.hoisted(() => ({ reportPresence: vi.fn(async () => ({ ok: true })) }))

vi.mock('../service/presence', () => ({ reportPresence: mocks.reportPresence }))
vi.mock('dsh-tauri/client', () => ({
  defineRegister: (setup: unknown) => function registerEffect() {
    const disposers: Array<() => void> = []
    const controller = {
      add: (disposer: () => void) => {
        disposers.push(disposer)
      },
      listen: (type: string, fn: EventListener) => {
        document.addEventListener(type, fn)
        disposers.push(() => document.removeEventListener(type, fn))
      },
      listenWindow: (type: string, fn: EventListener) => {
        window.addEventListener(type, fn)
        disposers.push(() => window.removeEventListener(type, fn))
      },
      interval: (fn: () => void, ms: number) => {
        const id = setInterval(fn, ms)
        disposers.push(() => clearInterval(id))
      },
    }
    ;(setup as (controller: unknown) => void)(controller)
    return () => {
      for (const dispose of disposers.splice(0).reverse())
        dispose()
    }
  },
}))

let visibility: DocumentVisibilityState = 'visible'
let dispose: (() => void) | undefined

function mount(): void {
  dispose = (presenceFeature as unknown as () => () => void)()
}

function setVisibility(next: DocumentVisibilityState): void {
  visibility = next
  document.dispatchEvent(new Event('visibilitychange'))
}

function reports(): unknown[] {
  return mocks.reportPresence.mock.calls.map(call => (call as unknown[])[0])
}

describe('presenceFeature', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    visibility = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  })

  afterEach(() => {
    dispose?.()
    dispose = undefined
    Reflect.deleteProperty(window, 'ReactNativeWebView')
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('挂载时立即上报当前可见状态，clientId 只含安全字符', () => {
    mount()
    expect(reports()).toEqual([{ clientId: expect.stringMatching(/^[\w-]{1,64}$/), visible: true }])
  })

  it('可见性变化时立即上报，同一实例的 clientId 保持不变', () => {
    mount()
    setVisibility('hidden')
    setVisibility('visible')
    const ids = new Set(reports().map(report => (report as { clientId: string }).clientId))
    expect(reports().map(report => (report as { visible: boolean }).visible)).toEqual([true, false, true])
    expect(ids.size).toBe(1)
  })

  it('可见时每 20 秒心跳一次，后台时不发心跳', () => {
    mount()
    vi.advanceTimersByTime(20_000)
    expect(mocks.reportPresence).toHaveBeenCalledTimes(2)
    setVisibility('hidden')
    vi.advanceTimersByTime(60_000)
    expect(reports().map(report => (report as { visible: boolean }).visible)).toEqual([true, true, false])
  })

  it('页面隐藏卸载时带 keepalive 上报后台', () => {
    mount()
    window.dispatchEvent(new Event('pagehide'))
    expect(reports().at(-1)).toEqual({ clientId: expect.any(String), visible: false, keepalive: true })
  })

  it('卸载时上报后台并停止心跳', () => {
    mount()
    dispose?.()
    dispose = undefined
    expect(reports().at(-1)).toEqual({ clientId: expect.any(String), visible: false })
    const count = mocks.reportPresence.mock.calls.length
    vi.advanceTimersByTime(60_000)
    setVisibility('hidden')
    expect(mocks.reportPresence).toHaveBeenCalledTimes(count)
  })

  it('在 DSH Mobile 的 WebView 里不上报', () => {
    Reflect.set(window, 'ReactNativeWebView', { postMessage: () => {} })
    mount()
    vi.advanceTimersByTime(60_000)
    setVisibility('hidden')
    expect(mocks.reportPresence).not.toHaveBeenCalled()
  })
})
