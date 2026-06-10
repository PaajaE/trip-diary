import { beforeEach, describe, expect, it } from 'vitest'
import {
  consumeAuthReturnPath,
  storeAuthReturnPath,
} from '@/features/auth/session/auth-return'

describe('auth return path', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('stores and consumes a local application path once', () => {
    storeAuthReturnPath('/invite/token')

    expect(consumeAuthReturnPath()).toBe('/invite/token')
    expect(consumeAuthReturnPath()).toBeNull()
  })

  it('rejects protocol-relative redirects', () => {
    storeAuthReturnPath('//example.test/phishing')

    expect(consumeAuthReturnPath()).toBeNull()
  })
})
