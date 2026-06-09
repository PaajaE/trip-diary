import { describe, expect, it } from 'vitest'
import { signUpSchema } from '@/features/auth/model/auth.schemas'

describe('signUpSchema', () => {
  it('accepts matching valid credentials', () => {
    expect(
      signUpSchema.safeParse({
        confirmPassword: 'StrongPass1',
        email: 'traveler@example.com',
        password: 'StrongPass1',
        username: 'traveler',
      }).success,
    ).toBe(true)
  })

  it('rejects mismatched passwords', () => {
    expect(
      signUpSchema.safeParse({
        confirmPassword: 'DifferentPass1',
        email: 'traveler@example.com',
        password: 'StrongPass1',
        username: 'traveler',
      }).success,
    ).toBe(false)
  })
})
