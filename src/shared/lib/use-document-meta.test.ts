import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'

describe('useDocumentMeta', () => {
  it('sets the title without restoring it on rerender', () => {
    document.title = 'Trip Diary'

    const { rerender } = renderHook(
      ({ title }) => useDocumentMeta(title === null ? null : { title }),
      { initialProps: { title: 'Novaaa' as string | null } },
    )

    expect(document.title).toBe('Novaaa')

    rerender({ title: 'Novaaa' })
    expect(document.title).toBe('Novaaa')

    rerender({ title: 'Updated trip' })
    expect(document.title).toBe('Updated trip')
  })
})
