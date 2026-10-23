import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPushRuntime } from '../config/runtime'
import { presence } from './presence'

const start = 1_000_000

describe('presence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(start)
  })

  afterEach(() => {
    clearPushRuntime()
    vi.useRealTimers()
  })

  it('没有任何上报时认为没人在看', () => {
    expect(presence.peek(0)).toBe(false)
  })

  it('可见上报在 50 秒宽限期内算在看，过期后不算', () => {
    presence.update('desktop', true)
    vi.setSystemTime(start + 49_000)
    expect(presence.peek(start + 49_000)).toBe(true)
    expect(presence.peek(start + 50_000)).toBe(true)
    expect(presence.peek(start + 50_001)).toBe(false)
  })

  it('转入后台之后发生的事件不再被抑制，之前发生的仍算看过', () => {
    presence.update('desktop', true)
    vi.setSystemTime(start + 5_000)
    presence.update('desktop', false)
    expect(presence.peek(start + 5_001)).toBe(false)
    expect(presence.peek(start + 4_000)).toBe(true)
  })

  it('从没可见过的窗口上报后台不影响判定', () => {
    presence.update('desktop', false)
    expect(presence.peek(0)).toBe(false)
  })

  it('多个窗口里只要有一个可见就算在看', () => {
    presence.update('desktop', false)
    presence.update('browser', true)
    expect(presence.peek(start)).toBe(true)
  })

  it('心跳续期可见状态', () => {
    presence.update('desktop', true)
    vi.setSystemTime(start + 40_000)
    presence.update('desktop', true)
    expect(presence.peek(start + 89_000)).toBe(true)
  })

  it('超过 64 个窗口时丢掉最早的记录', () => {
    presence.update('oldest', true)
    vi.setSystemTime(start + 1)
    for (let index = 0; index < 64; index++) {
      presence.update(`client-${index}`, true)
      presence.update(`client-${index}`, false)
    }
    expect(presence.peek(start + 2)).toBe(false)
  })

  it('不足 64 个窗口时保留最早的可见记录', () => {
    presence.update('oldest', true)
    vi.setSystemTime(start + 1)
    for (let index = 0; index < 63; index++) {
      presence.update(`client-${index}`, true)
      presence.update(`client-${index}`, false)
    }
    expect(presence.peek(start + 2)).toBe(true)
  })
})
