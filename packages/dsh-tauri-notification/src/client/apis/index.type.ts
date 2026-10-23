export type GetApiTauriNotificationTurnEndResponse = { reason?: undefined | string; turn?: undefined | number };
export type GetApiTauriNotificationTurnEndQuerySessionId = undefined | string;
export type PutApiTauriNotificationPushDevicesResponse = { delivering?: undefined | false | true; ok: false | true; error?: undefined | string };
export type DeleteApiTauriNotificationPushDevicesResponse = { ok: false | true; error?: undefined | string };
export type PutApiTauriNotificationPresenceResponse = { ok: false | true; error?: undefined | string };

export interface PutApiTauriNotificationPushDevicesBody {
  token?: undefined | string;
  platform?: undefined | string;
  locale?: undefined | string;
  origin?: undefined | string;
}
export interface DeleteApiTauriNotificationPushDevicesBody {
  token?: undefined | string;
}
export interface PutApiTauriNotificationPresenceBody {
  clientId?: undefined | string;
  visible?: undefined | false | true;
}
export interface GetApiTauriNotificationTurnEndQuery {
  sessionId?: GetApiTauriNotificationTurnEndQuerySessionId;
}
