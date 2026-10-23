/*
 * @title index
 * @swagger 2.0
 * @version 0.0.0
 */

import type * as Types from "./index.type";
import { ofetch } from "dsh-tauri/client";
import type { FetchOptions } from "dsh-tauri/client";

/** @method get */
export function getTurnEnd(params?: Types.GetApiTauriNotificationTurnEndQuery, options?: FetchOptions) {
  return ofetch<Types.GetApiTauriNotificationTurnEndResponse>("/api/tauri/notification/turn-end", { method: "get", params, ...options });
}

/** @method put */
export function putPushDevices(body: Types.PutApiTauriNotificationPushDevicesBody, options?: FetchOptions) {
  return ofetch<Types.PutApiTauriNotificationPushDevicesResponse>("/api/tauri/notification/push/devices", { method: "put", body, ...options });
}

/** @method delete */
export function deletePushDevices(body: Types.DeleteApiTauriNotificationPushDevicesBody, options?: FetchOptions) {
  return ofetch<Types.DeleteApiTauriNotificationPushDevicesResponse>("/api/tauri/notification/push/devices", { method: "delete", body, ...options });
}

/** @method put */
export function putPresence(body: Types.PutApiTauriNotificationPresenceBody, options?: FetchOptions) {
  return ofetch<Types.PutApiTauriNotificationPresenceResponse>("/api/tauri/notification/presence", { method: "put", body, ...options });
}
