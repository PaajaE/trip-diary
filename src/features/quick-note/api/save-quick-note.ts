import { createMoments } from '@/entities/moment/api/moment.repository'
import { BODY_MAX_LENGTH } from '@/features/journey-workspace/lib/text-edit'
import {
  getCurrentDevicePosition,
  type DevicePosition,
} from '@/shared/lib/geolocation'

export type QuickNoteResult =
  | { ok: true; located: boolean }
  | { ok: false; reason: 'empty' | 'too_long' | 'save_failed' }

interface Deps {
  createMoments: typeof createMoments
  getPosition: () => Promise<DevicePosition>
  newId: () => string
  now: () => Date
}

const defaults: Deps = {
  createMoments,
  getPosition: () => getCurrentDevicePosition({ timeout: 8_000 }),
  newId: () => crypto.randomUUID(),
  now: () => new Date(),
}

/**
 * Saves a note as a manual, locked moment at this very instant (the moment of
 * writing is the time of the experience here, which is why the wall clock is
 * correct). The position is best effort: refusing or failing to locate still
 * saves the note, without coordinates.
 */
export async function saveQuickNote(
  input: {
    text: string
    useLocation: boolean
    userId: string
    journeyId: string
  },
  deps: Deps = defaults,
): Promise<QuickNoteResult> {
  const body = input.text.replace(/\r\n?/g, '\n').trim()
  if (body === '') return { ok: false, reason: 'empty' }
  if (Array.from(body).length > BODY_MAX_LENGTH) {
    return { ok: false, reason: 'too_long' }
  }
  let position: DevicePosition | null = null
  if (input.useLocation) {
    position = await deps.getPosition().catch(() => null)
  }
  const at = deps.now().toISOString()
  try {
    await deps.createMoments([
      {
        body,
        createdBy: input.userId,
        endsAt: at,
        id: deps.newId(),
        journeyId: input.journeyId,
        latitude: position?.latitude ?? null,
        locked: true,
        longitude: position?.longitude ?? null,
        origin: 'manual',
        startsAt: at,
      },
    ])
  } catch {
    return { ok: false, reason: 'save_failed' }
  }
  return { located: position !== null, ok: true }
}
