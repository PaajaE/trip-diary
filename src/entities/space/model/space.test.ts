import { describe, expect, it } from 'vitest'
import {
  createFamilySpaceSchema,
  createSpaceInviteSchema,
  spaceSummarySchema,
} from '@/entities/space/model/space'

describe('space models', () => {
  it('normalizes a family handle', () => {
    expect(
      createFamilySpaceSchema.parse({
        handle: ' Ecerovi-2016 ',
        name: 'Ečerovi',
      }),
    ).toEqual({ handle: 'ecerovi-2016', name: 'Ečerovi' })
  })

  it('rejects owner roles in invitations', () => {
    expect(
      createSpaceInviteSchema.safeParse({
        email: 'family@example.test',
        role: 'owner',
        spaceId: crypto.randomUUID(),
      }).success,
    ).toBe(false)
  })

  it('validates a space summary at the boundary', () => {
    expect(
      spaceSummarySchema.safeParse({
        avatarUrl: null,
        description: null,
        handle: 'ecerovi-2016',
        id: crypto.randomUUID(),
        kind: 'family',
        name: 'Ečerovi',
        role: 'owner',
      }).success,
    ).toBe(true)
  })
})
