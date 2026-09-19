import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranslationRequest } from '@trip-diary/translation'
import { invokeTranslateEntry } from './translate-entry.ts'

const invokeMock = vi.fn()

function createClientStub() {
  return {
    functions: {
      invoke: invokeMock,
    },
  } as never
}

const request: TranslationRequest = {
  entry_id: '550e8400-e29b-41d4-a716-446655440000',
  target_locale: 'en',
}

describe('invokeTranslateEntry', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('returns a validated succeeded response', async () => {
    invokeMock.mockResolvedValue({
      data: {
        entry_id: request.entry_id,
        model: 'mock-model',
        provider: 'mock',
        source_locale: 'cs',
        status: 'succeeded',
        target_locale: 'en',
        translated_body: '[en] Body',
        translated_title: '[en] Title',
      },
      error: null,
    })

    await expect(
      invokeTranslateEntry(createClientStub(), request),
    ).resolves.toMatchObject({
      provider: 'mock',
      status: 'succeeded',
      translated_body: '[en] Body',
    })
    expect(invokeMock).toHaveBeenCalledWith('translate-entry', {
      body: request,
    })
  })

  it('throws known edge-function error codes', async () => {
    invokeMock.mockResolvedValue({
      data: { error: 'entry_not_found' },
      error: null,
    })

    await expect(
      invokeTranslateEntry(createClientStub(), request),
    ).rejects.toThrow('entry_not_found')
  })

  it('throws when the invoke transport fails', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new Error('network down'),
    })

    await expect(
      invokeTranslateEntry(createClientStub(), request),
    ).rejects.toThrow('network down')
  })

  it('throws for invalid payloads', async () => {
    invokeMock.mockResolvedValue({
      data: { unexpected: true },
      error: null,
    })

    await expect(
      invokeTranslateEntry(createClientStub(), request),
    ).rejects.toThrow('invalid_translation_response')
  })
})
