import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSession } from '@/features/auth/session/use-session'

describe('useSession', () => {
  it('requires a SessionProvider', () => {
    expect(() => renderHook(() => useSession())).toThrow(
      'useSession must be used within a SessionProvider',
    )
  })
})
