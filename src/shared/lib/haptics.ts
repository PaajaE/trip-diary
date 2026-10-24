import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

export type HapticKind = 'light' | 'medium' | 'success' | 'warning'

async function play(kind: HapticKind): Promise<void> {
  switch (kind) {
    case 'light':
      await Haptics.impact({ style: ImpactStyle.Light })
      return
    case 'medium':
      await Haptics.impact({ style: ImpactStyle.Medium })
      return
    case 'success':
      await Haptics.notification({ type: NotificationType.Success })
      return
    case 'warning':
      await Haptics.notification({ type: NotificationType.Warning })
      return
  }
}

/**
 * Short tactile feedback for an action. Native only: a silent no-op on the web
 * and whenever the plugin fails. Fire-and-forget, never throws.
 */
export function haptic(kind: HapticKind): void {
  try {
    if (!Capacitor.isNativePlatform()) return
    void play(kind).catch(() => undefined)
  } catch {
    // Feedback is a nicety; never break the action it accompanies.
  }
}
