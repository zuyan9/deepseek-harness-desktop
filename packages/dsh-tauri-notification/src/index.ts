import { PLUGIN_ID } from './shared/constants'

export const name = PLUGIN_ID

/** 宿主服务依赖：`webServer`（注册路由）、`connection`（路由鉴权闸门，注册期必需）与 `workspaceRegistry`（判定会话是否已归档）。 */
export const inject = ['webServer', 'connection', 'workspaceRegistry']

/**
 * 宿主半边做两件事：
 *
 * 1. 回答「这个会话的回合为什么结束」。客户端只看得到 `running: boolean`，分不出「正常跑完」和
 *    「用户手动中断」；`turn/end` 的 `reason.kind` 只出现在宿主事件里，于是按会话记在内存里，
 *    经 `GET /api/tauri/notification/turn-end` 暴露给客户端。
 * 2. 给登记过的手机发远程推送（Expo 推送服务中转到 APNs/FCM）。手机 App 被挂起后 WebView 里的
 *    客户端通知就停了，所以回合结束、授权、提问由宿主事件直接驱动；有任何窗口在前台就不推。
 */
export { apply } from './host/apply'
