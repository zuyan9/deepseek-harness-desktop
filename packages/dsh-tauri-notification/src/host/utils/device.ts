import type { PushLocale, PushPlatform } from '../types'

const PUSH_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[[\w-]{1,200}\]$/
const ORIGIN_LIMIT = 512

export function isPushToken(value: unknown): value is string {
  return typeof value === 'string' && PUSH_TOKEN_PATTERN.test(value)
}

export function isPushPlatform(value: unknown): value is PushPlatform {
  return value === 'ios' || value === 'android'
}

export function isPushLocale(value: unknown): value is PushLocale {
  return value === 'zh' || value === 'en'
}

export function isPushOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > ORIGIN_LIMIT || !URL.canParse(value))
    return false
  const url = new URL(value)
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value
}
