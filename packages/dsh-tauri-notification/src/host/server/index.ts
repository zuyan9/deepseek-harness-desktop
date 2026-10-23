import { defineWebServer } from 'dsh-h3'
import { guard } from 'dsh-tauri'
import presence from './routes/presence/put'
import pushDevicesDelete from './routes/push/devices/delete'
import pushDevices from './routes/push/devices/put'
import turnEnd from './routes/turn-end/get'

export const server = defineWebServer((app) => {
  app.use(guard)
  app.get('/api/tauri/notification/turn-end', turnEnd)
  app.put('/api/tauri/notification/push/devices', pushDevices)
  app.delete('/api/tauri/notification/push/devices', pushDevicesDelete)
  app.put('/api/tauri/notification/presence', presence)
})
