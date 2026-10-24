import { describe, expect, it } from 'vitest'
import {
  buildUploaderModel,
  isForeignUploader,
  NO_UPLOADERS,
  uploaderText,
} from '@/features/media-batch/model/uploaders'

const ME = '00000000-0000-4000-8000-000000000001'
const JIRINA = '00000000-0000-4000-8000-000000000002'
const member = (
  userId: string,
  displayName: string | null,
  username: string | null,
) => ({
  displayName,
  userId,
  username,
})
const t = ((key: string, options?: { name?: string }) =>
  options?.name === undefined ? key : `${key}:${options.name}`) as never

describe('buildUploaderModel', () => {
  it('is silent without a signed-in user', () => {
    expect(buildUploaderModel(null, [member(ME, 'Me', null)], [JIRINA])).toBe(
      NO_UPLOADERS,
    )
  })

  it('is single-member when only I contribute', () => {
    const model = buildUploaderModel(ME, [member(ME, 'Me', null)], [ME, ME])
    expect(model.multi).toBe(false)
    expect(isForeignUploader(model, ME)).toBe(false)
  })

  it('is shared with two members and names them (display name, then username)', () => {
    const model = buildUploaderModel(
      ME,
      [member(ME, 'Me', null), member(JIRINA, null, 'jirina')],
      [],
    )
    expect(model.multi).toBe(true)
    expect(model.names.get(JIRINA)).toBe('jirina')
    expect(uploaderText(t, model, JIRINA)).toBe('mediaBatch.uploader.by:jirina')
    expect(uploaderText(t, model, ME)).toBeNull()
  })

  it('falls back to the media owners when the member list is unavailable', () => {
    const model = buildUploaderModel(ME, null, [ME, JIRINA])
    expect(model.multi).toBe(true)
    expect(uploaderText(t, model, JIRINA)).toBe('mediaBatch.uploader.byOther')
    expect(buildUploaderModel(ME, null, [ME]).multi).toBe(false)
  })
})
