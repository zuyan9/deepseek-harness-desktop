import type { PushDevice } from '../types'
import type { ExpoPushMessage } from './push.types'
import { describe, expect, it } from 'vitest'
import { pushMessagesOf, ticketOutcomeOf, unregisteredReceiptTokensOf } from './push.utils'

const zh: PushDevice = { token: 'ExponentPushToken[zh]', platform: 'ios', locale: 'zh', origin: 'https://harness.test:3080', updatedAt: 1 }
const en: PushDevice = { token: 'ExponentPushToken[en]', platform: 'android', locale: 'en', origin: 'http://192.168.1.2:3088', updatedAt: 1 }

describe('pushMessagesOf', () => {
  it('按设备语言生成回合推送，标题用会话标题，数据带上设备登记的 origin', () => {
    expect(pushMessagesOf([zh, en], { sessionId: 's1', kind: 'turn', detail: '', title: '  修复登录  ', sequence: 7 })).toEqual([
      {
        to: 'ExponentPushToken[zh]',
        title: '修复登录',
        body: '轮次已完成',
        sound: 'default',
        priority: 'high',
        channelId: 'dsh-bridge',
        data: { origin: 'https://harness.test:3080', sessionId: 's1', title: '修复登录', tag: 'dsh-notification-s1-7' },
      },
      {
        to: 'ExponentPushToken[en]',
        title: '修复登录',
        body: 'Turn completed',
        sound: 'default',
        priority: 'high',
        channelId: 'dsh-bridge',
        data: { origin: 'http://192.168.1.2:3088', sessionId: 's1', title: '修复登录', tag: 'dsh-notification-s1-7' },
      },
    ])
  })

  it('授权与提问用 pending 标签，正文是「动作 · 摘要」', () => {
    const [approval] = pushMessagesOf([zh], { sessionId: 's1', kind: 'approval', detail: 'shell: 需要写入权限', title: 'T', sequence: 1 })
    const [question] = pushMessagesOf([en], { sessionId: 's1', kind: 'question', detail: 'Deploy?', title: 'T', sequence: 2 })
    expect(approval).toMatchObject({ body: '需要授权 · shell: 需要写入权限', data: { tag: 'dsh-notification-pending-s1-1' } })
    expect(question).toMatchObject({ body: 'Answer required · Deploy?', data: { tag: 'dsh-notification-pending-s1-2' } })
  })

  it('没有会话标题时用语言对应的兜底标题', () => {
    expect(pushMessagesOf([zh, en], { sessionId: 's1', kind: 'turn', detail: '', title: undefined, sequence: 1 }).map(message => message.title))
      .toEqual(['DSH 会话', 'DSH session'])
  })

  it('标题与正文按字符截断并补省略号', () => {
    const [message] = pushMessagesOf([zh], { sessionId: 's1', kind: 'question', detail: '问'.repeat(300), title: '题'.repeat(200), sequence: 1 })
    expect(Array.from(message!.title)).toHaveLength(120)
    expect(message!.title.endsWith('…')).toBe(true)
    expect(Array.from(message!.body)).toHaveLength(200)
    expect(message!.body.startsWith('需要回答 · 问')).toBe(true)
  })
})

describe('ticketOutcomeOf', () => {
  const messages = pushMessagesOf([zh, en], { sessionId: 's1', kind: 'turn', detail: '', title: 'T', sequence: 1 })

  it('按消息顺序把成功回执记成待查收据，DeviceNotRegistered 记成要删除的 token', () => {
    const outcome = ticketOutcomeOf(messages, {
      data: [
        { status: 'ok', id: 'receipt-zh' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ],
    })
    expect(outcome.unregistered).toEqual(['ExponentPushToken[en]'])
    expect([...outcome.receipts]).toEqual([['receipt-zh', 'ExponentPushToken[zh]']])
  })

  it('其它错误既不删设备也不查收据', () => {
    const outcome = ticketOutcomeOf(messages, { data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }, { status: 'error' }] })
    expect(outcome.unregistered).toEqual([])
    expect(outcome.receipts.size).toBe(0)
  })

  it('响应体不是回执数组时返回空结果', () => {
    for (const payload of [null, 'text', { data: 'x' }, { errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS' }] }]) {
      const outcome = ticketOutcomeOf(messages as readonly ExpoPushMessage[], payload)
      expect(outcome.unregistered).toEqual([])
      expect(outcome.receipts.size).toBe(0)
    }
  })
})

describe('unregisteredReceiptTokensOf', () => {
  it('只返回收据为 DeviceNotRegistered 且能对上 token 的设备', () => {
    const receipts = new Map([['r1', 'ExponentPushToken[a]'], ['r2', 'ExponentPushToken[b]']])
    expect(unregisteredReceiptTokensOf({
      data: {
        r1: { status: 'error', details: { error: 'DeviceNotRegistered' } },
        r2: { status: 'ok' },
        r3: { status: 'error', details: { error: 'DeviceNotRegistered' } },
      },
    }, receipts)).toEqual(['ExponentPushToken[a]'])
  })

  it('响应体缺失时返回空列表', () => {
    expect(unregisteredReceiptTokensOf(undefined, new Map([['r1', 'ExponentPushToken[a]']]))).toEqual([])
  })
})
