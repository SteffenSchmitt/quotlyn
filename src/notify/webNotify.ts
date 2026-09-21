export type NotifyPermission = 'unsupported' | 'default' | 'granted' | 'denied'

export function permissionState(): NotifyPermission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export async function requestPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}

export function notify(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, tag: `${title}:${body}` })
  } catch {
    // Some browsers throw for constructor use in non-secure contexts; nothing to do.
  }
}
