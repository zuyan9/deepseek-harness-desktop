import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

let tokenRequest: Promise<string | null> | undefined

export function readPushToken(): Promise<string | null> {
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId
  if (typeof projectId !== 'string' || !projectId || (Platform.OS === 'android' && Constants.expoConfig?.extra?.fcmConfigured !== true))
    return Promise.resolve(null)
  tokenRequest ??= Notifications.getExpoPushTokenAsync({ projectId })
    .then(token => token.data)
    .catch((error) => {
      tokenRequest = undefined
      console.error('[notification] push token failed:', error)
      return null
    })
  return tokenRequest
}
