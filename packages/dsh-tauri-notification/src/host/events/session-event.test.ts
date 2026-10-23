import type { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../server'
import { push } from '../service/push'
import { clearTurnEndFacts, turnEndFact } from '../service/turn-end'
import { handleSessionEvent } from './session-event'

vi.mock('../service/push', () => ({ push: { schedule: vi.fn(), cancel: vi.fn() } }))

describe('handleSessionEvent', () => {
  let disposeServer: () => void
  beforeEach(() => {
    clearTurnEndFacts()
    disposeServer = server({
      workspaceRegistry: { archivedSessionIds: [] },
      webServer: { register: () => () => {} },
    } as unknown as Context)
  })

  afterEach(() => {
    disposeServer()
    clearTurnEndFacts()
    vi.clearAllMocks()
  })

  it('记下 turn/end 的结束原因与回合号', () => {
    handleSessionEvent({ id: 's1' }, { type: 'turn/end', data: { turn: 3, reason: { kind: 'aborted' } } })
    expect(turnEndFact('s1')).toEqual({ reason: 'aborted', turn: 3 })
  })

  it('忽略其它事件类型', () => {
    handleSessionEvent({ id: 's1' }, { type: 'assistant/message', data: { turn: 4, reason: { kind: 'aborted' } } })
    expect(turnEndFact('s1')).toBeUndefined()
    expect(push.schedule).not.toHaveBeenCalled()
    expect(push.cancel).not.toHaveBeenCalled()
  })

  it('缺少会话 id 时不记录也不调度推送', () => {
    handleSessionEvent({}, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
    handleSessionEvent({ id: '' }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
    expect(turnEndFact('s1')).toBeUndefined()
    expect(push.schedule).not.toHaveBeenCalled()
  })

  it('宿主没给结束原因时记成空原因，把上一次的旧原因冲掉', () => {
    // 直接返回会留下旧的 `aborted`，客户端就会把这一回合的通知也当成中断吞掉。
    handleSessionEvent({ id: 's1' }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'aborted' } } })
    expect(turnEndFact('s1')).toEqual({ reason: 'aborted', turn: 1 })
    handleSessionEvent({ id: 's1' }, { type: 'turn/end', data: { turn: 2 } })
    expect(turnEndFact('s1')).toEqual({ reason: '', turn: 2 })
    handleSessionEvent({ id: 's1' }, { type: 'turn/end' })
    expect(turnEndFact('s1')).toEqual({ reason: '', turn: -1 })
  })

  it('宿主没给回合号时用 -1 占位', () => {
    handleSessionEvent({ id: 's2' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(turnEndFact('s2')).toEqual({ reason: 'completed', turn: -1 })
  })

  it('同一会话只保留最近一次结束事实', () => {
    handleSessionEvent({ id: 's1' }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
    handleSessionEvent({ id: 's1' }, { type: 'turn/end', data: { turn: 2, reason: { kind: 'aborted' } } })
    expect(turnEndFact('s1')).toEqual({ reason: 'aborted', turn: 2 })
  })

  it('非中断的回合结束为该会话调度一条回合推送', () => {
    const session = { id: 's1' }
    handleSessionEvent(session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'error' } } })
    expect(push.schedule).toHaveBeenCalledExactlyOnceWith('s1', { kind: 'turn', key: '', detail: '', session })
    expect(push.cancel).not.toHaveBeenCalled()
  })

  it.each(['aborted', 'interrupted'])('用户中断（%s）的回合只取消待发推送', (kind) => {
    handleSessionEvent({ id: 's1' }, { type: 'turn/end', data: { turn: 1, reason: { kind } } })
    expect(push.cancel).toHaveBeenCalledExactlyOnceWith('s1')
    expect(push.schedule).not.toHaveBeenCalled()
  })

  it('子代理会话不调度任何推送', () => {
    handleSessionEvent({ id: 'child', header: { origin: 'subagent' } }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    handleSessionEvent({ id: 'child', summary: { origin: 'subagent' } }, { type: 'approval/asked', data: { id: 'a1', toolName: 'shell' } })
    handleSessionEvent({ id: 'child', header: { origin: 'subagent' } }, { type: 'tool/call', data: { name: 'ask_user_question', callId: 'q1', arguments: '{}' } })
    expect(push.schedule).not.toHaveBeenCalled()
  })

  it.each(['turn/start', 'user/message'])('%s 取消该会话所有待发推送', (type) => {
    handleSessionEvent({ id: 's1' }, { type, data: {} })
    expect(push.cancel).toHaveBeenCalledExactlyOnceWith('s1')
  })

  it('授权推送的正文是工具名加原因的第一个分句', () => {
    const session = { id: 's1' }
    handleSessionEvent(session, { type: 'approval/asked', data: { id: 'a1', toolName: 'shell', reason: '需要写入权限：沙箱拒绝了 /etc/hosts' } })
    expect(push.schedule).toHaveBeenCalledExactlyOnceWith('s1', { kind: 'approval', key: 'a1', detail: 'shell: 需要写入权限', session })
  })

  it('授权没有原因时正文只放工具名', () => {
    handleSessionEvent({ id: 's1' }, { type: 'approval/asked', data: { id: 'a1', toolName: 'shell' } })
    expect(vi.mocked(push.schedule).mock.calls[0]?.[1].detail).toBe('shell')
  })

  it('approval/decided 只取消同一个授权的推送', () => {
    handleSessionEvent({ id: 's1' }, { type: 'approval/decided', data: { id: 'a1', outcome: 'allowed-once' } })
    expect(push.cancel).toHaveBeenCalledExactlyOnceWith('s1', 'a1')
  })

  it('ask_user_question 调用调度提问推送，正文取第一题的题目', () => {
    const session = { id: 's1' }
    const args = JSON.stringify({ questions: [{ id: 'q', header: '部署', question: '要发布到生产环境吗？' }, { question: '第二题' }] })
    handleSessionEvent(session, { type: 'tool/call', data: { name: 'ask_user_question', callId: 'c1', arguments: args } })
    expect(push.schedule).toHaveBeenCalledExactlyOnceWith('s1', { kind: 'question', key: 'c1', detail: '要发布到生产环境吗？', session })
  })

  it('提问没有题目文本时退回到 header，参数不是 JSON 时正文留空', () => {
    handleSessionEvent({ id: 's1' }, { type: 'tool/call', data: { name: 'ask_user_question', callId: 'c1', arguments: JSON.stringify({ questions: [{ header: '部署' }] }) } })
    handleSessionEvent({ id: 's2' }, { type: 'tool/call', data: { name: 'ask_user_question', callId: 'c2', arguments: '{not json' } })
    expect(vi.mocked(push.schedule).mock.calls.map(call => call[1].detail)).toEqual(['部署', ''])
  })

  it('其它工具调用不调度推送', () => {
    handleSessionEvent({ id: 's1' }, { type: 'tool/call', data: { name: 'shell', callId: 'c1', arguments: '{}' } })
    expect(push.schedule).not.toHaveBeenCalled()
  })

  it('tool/result 按调用 id 取消对应的提问推送', () => {
    handleSessionEvent({ id: 's1' }, { type: 'tool/result', data: { message: { toolCallId: 'c1' } } })
    expect(push.cancel).toHaveBeenCalledExactlyOnceWith('s1', 'c1')
  })
})
