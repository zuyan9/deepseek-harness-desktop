export type PushPlatform = 'ios' | 'android'

export type PushLocale = 'zh' | 'en'

export interface PushDevice {
  token: string
  platform: PushPlatform
  locale: PushLocale
  origin: string
  updatedAt: number
}

export type PushKind = 'turn' | 'approval' | 'question'

export interface PushNotice {
  kind: PushKind
  key: string
  detail: string
  session: unknown
}

export interface PendingPush {
  notice: PushNotice
  timer: ReturnType<typeof setTimeout>
}
