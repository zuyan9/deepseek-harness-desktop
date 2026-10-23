import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  platform: { OS: 'android' },
  constants: { easConfig: undefined as { projectId?: string } | undefined, expoConfig: { extra: {} as Record<string, unknown> } },
  getExpoPushTokenAsync: vi.fn<(options: { projectId: string }) => Promise<{ type: 'expo', data: string }>>(),
}))

vi.mock('react-native', () => ({ Platform: native.platform }))
// expo-constants 缺 __DEV__ 无法在 node 里加载；用例直接改写它暴露的配置。
vi.mock('expo-constants', () => ({ default: native.constants }))
vi.mock('expo-notifications', () => ({ getExpoPushTokenAsync: native.getExpoPushTokenAsync }))

async function readPushToken() {
  return (await import('./use-push')).readPushToken()
}

describe('readPushToken', () => {
  beforeEach(() => {
    vi.resetModules()
    native.platform.OS = 'android'
    native.constants.easConfig = undefined
    native.constants.expoConfig.extra = { eas: { projectId: 'project-id' }, fcmConfigured: true }
    native.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: 'ExponentPushToken[phone]' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetAllMocks()
  })

  it('没有 EAS projectId 时不向 Expo 请求 token', async () => {
    native.constants.expoConfig.extra = { fcmConfigured: true }
    expect(await readPushToken()).toBeNull()
    expect(native.getExpoPushTokenAsync).not.toHaveBeenCalled()
  })

  it('安卓构建没带 FCM 配置时不请求 token', async () => {
    native.constants.expoConfig.extra = { eas: { projectId: 'project-id' } }
    expect(await readPushToken()).toBeNull()
    expect(native.getExpoPushTokenAsync).not.toHaveBeenCalled()
  })

  it('iOS 只需要 projectId，EAS 构建自带的 projectId 优先', async () => {
    native.platform.OS = 'ios'
    native.constants.easConfig = { projectId: 'eas-project' }
    native.constants.expoConfig.extra = { eas: { projectId: 'project-id' } }
    expect(await readPushToken()).toBe('ExponentPushToken[phone]')
    expect(native.getExpoPushTokenAsync).toHaveBeenCalledExactlyOnceWith({ projectId: 'eas-project' })
  })

  it('同一次运行只向 Expo 换一次 token', async () => {
    const { readPushToken: read } = await import('./use-push')
    expect(await Promise.all([read(), read()])).toEqual(['ExponentPushToken[phone]', 'ExponentPushToken[phone]'])
    expect(await read()).toBe('ExponentPushToken[phone]')
    expect(native.getExpoPushTokenAsync).toHaveBeenCalledOnce()
  })

  it('换 token 失败时记录错误并返回 null，下一次重新请求', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('offline')
    native.getExpoPushTokenAsync.mockRejectedValueOnce(failure)
    const { readPushToken: read } = await import('./use-push')
    expect(await read()).toBeNull()
    expect(error).toHaveBeenCalledExactlyOnceWith('[notification] push token failed:', failure)
    expect(await read()).toBe('ExponentPushToken[phone]')
    expect(native.getExpoPushTokenAsync).toHaveBeenCalledTimes(2)
  })
})
