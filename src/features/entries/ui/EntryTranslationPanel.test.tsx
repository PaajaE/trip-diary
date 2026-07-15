import '@/app/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computeSourceContentHash,
  type EntryTranslation,
  type TranslationStatus,
} from '@trip-diary/translation'
import { EntryTranslationPanel } from '@/features/entries/ui/EntryTranslationPanel'

const {
  useEntryTranslationQuery,
  useRequestEntryTranslationMutation,
  useSaveEntryTranslationEditsMutation,
} = vi.hoisted(() => ({
  useEntryTranslationQuery: vi.fn(),
  useRequestEntryTranslationMutation: vi.fn(),
  useSaveEntryTranslationEditsMutation: vi.fn(),
}))

vi.mock('@/entities/translation/api', () => ({
  invalidateEntryTranslations: vi.fn(),
  translationQueryKeys: {
    all: ['entry-translations'],
    byEntry: (entryId: string) => ['entry-translations', entryId],
    detail: (entryId: string, targetLocale: string) => [
      'entry-translations',
      entryId,
      targetLocale,
    ],
  },
  useEntryTranslationQuery,
  useRequestEntryTranslationMutation,
  useSaveEntryTranslationEditsMutation,
}))

const entryId = '550e8400-e29b-41d4-a716-446655440000'

const entry = {
  body: 'Body text',
  id: entryId,
  language: 'cs' as const,
  title: 'Praha',
  version: 1,
}

function createTranslation(
  status: TranslationStatus,
  overrides: Partial<EntryTranslation> = {},
): EntryTranslation {
  return {
    completed_at:
      status === 'succeeded' || status === 'stale'
        ? '2026-07-10T12:00:00.000+00:00'
        : null,
    created_at: '2026-07-10T11:00:00.000+00:00',
    edited_at: null,
    entry_id: entryId,
    error_message: status === 'failed' ? 'provider_timeout' : null,
    id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    is_manually_edited: false,
    model: status === 'succeeded' || status === 'stale' ? 'mock-model' : null,
    provider: status === 'succeeded' || status === 'stale' ? 'mock' : null,
    requested_at: '2026-07-10T11:00:00.000+00:00',
    source_content_hash: computeSourceContentHash(entry.title, entry.body),
    source_locale: 'cs',
    source_version: entry.version,
    status,
    target_locale: 'en',
    translated_body:
      status === 'succeeded' || status === 'stale'
        ? 'Translated body text.'
        : '',
    translated_title:
      status === 'succeeded' || status === 'stale' ? 'Translated title' : null,
    updated_at: '2026-07-10T12:00:00.000+00:00',
    ...overrides,
  }
}

function createQueryResult(
  translation: EntryTranslation | null | undefined,
  overrides: Record<string, unknown> = {},
) {
  return {
    data: translation,
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(<EntryTranslationPanel entry={entry} />, {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  })
}

describe('EntryTranslationPanel', () => {
  let requestMutateAsync: ReturnType<typeof vi.fn>
  let saveMutateAsync: ReturnType<typeof vi.fn>

  afterEach(cleanup)

  beforeEach(() => {
    requestMutateAsync = vi.fn()
    saveMutateAsync = vi.fn()
    useEntryTranslationQuery.mockReturnValue(createQueryResult(undefined))
    useRequestEntryTranslationMutation.mockReturnValue({
      isPending: false,
      mutateAsync: requestMutateAsync,
    })
    useSaveEntryTranslationEditsMutation.mockReturnValue({
      isPending: false,
      mutateAsync: saveMutateAsync,
    })
  })

  it.each([
    ['none', undefined, 'Zatím nepřeloženo'],
    ['pending', createTranslation('pending'), 'Překlad ve frontě'],
    ['processing', createTranslation('processing'), 'Překládám…'],
    ['succeeded', createTranslation('succeeded'), 'Překlad je připraven'],
    ['failed', createTranslation('failed'), 'Překlad selhal'],
    ['stale', createTranslation('stale'), 'Překlad je zastaralý'],
  ] as const)(
    'renders the %s status label',
    (_status, translation, expectedLabel) => {
      useEntryTranslationQuery.mockReturnValue(createQueryResult(translation))

      renderPanel()

      expect(screen.getByTestId('entry-translation-status')).toHaveTextContent(
        expectedLabel,
      )
    },
  )

  it('does not render for English source entries', () => {
    useEntryTranslationQuery.mockReturnValue(createQueryResult(null))

    render(<EntryTranslationPanel entry={{ ...entry, language: 'en' }} />)

    expect(
      screen.queryByRole('heading', { name: 'Anglický překlad' }),
    ).not.toBeInTheDocument()
  })

  it('shows processing state while generation mutation is pending', () => {
    useEntryTranslationQuery.mockReturnValue(createQueryResult(null))
    useRequestEntryTranslationMutation.mockReturnValue({
      isPending: true,
      mutateAsync: requestMutateAsync,
    })

    renderPanel()

    expect(screen.getByTestId('entry-translation-status')).toHaveTextContent(
      'Překládám…',
    )
    expect(
      screen.queryByRole('button', { name: 'Přeložit do angličtiny' }),
    ).not.toBeInTheDocument()
  })

  it('renders editable fields for succeeded translations', () => {
    useEntryTranslationQuery.mockReturnValue(
      createQueryResult(createTranslation('succeeded')),
    )

    renderPanel()

    expect(screen.getByLabelText('Anglický název')).toHaveValue(
      'Translated title',
    )
    expect(screen.getByLabelText('Anglický text')).toHaveValue(
      'Translated body text.',
    )
    expect(
      screen.getByText(
        'Ruční úpravy se ukládají k tvému účtu. Nové vygenerování je může přepsat.',
      ),
    ).toBeInTheDocument()
  })

  it('shows retry action and safe provider error for failed translations', async () => {
    const user = userEvent.setup()
    useEntryTranslationQuery.mockReturnValue(
      createQueryResult(createTranslation('failed')),
    )

    renderPanel()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Překlad se nepodařilo dokončit. Zkus to znovu.',
    )

    await user.click(screen.getByRole('button', { name: 'Zkusit znovu' }))

    await waitFor(() => {
      expect(requestMutateAsync).toHaveBeenCalled()
    })
  })

  it('shows stale status and regenerate action for outdated translations', async () => {
    const user = userEvent.setup()
    useEntryTranslationQuery.mockReturnValue(
      createQueryResult(
        createTranslation('succeeded', {
          source_content_hash: computeSourceContentHash('Praha', 'Body text'),
          source_version: 1,
        }),
      ),
    )

    render(
      <EntryTranslationPanel
        entry={{ ...entry, body: 'Old body', title: 'Old title', version: 2 }}
      />,
    )

    expect(screen.getByTestId('entry-translation-status')).toHaveTextContent(
      'Překlad je zastaralý',
    )

    await user.click(screen.getByRole('button', { name: 'Vygenerovat znovu' }))

    await waitFor(() => {
      expect(requestMutateAsync).toHaveBeenCalled()
    })
  })

  it('warns before regenerating manually edited translations', () => {
    useEntryTranslationQuery.mockReturnValue(
      createQueryResult(
        createTranslation('succeeded', {
          edited_at: '2026-07-10T13:00:00.000+00:00',
          is_manually_edited: true,
          translated_body: 'My custom English body.',
          translated_title: 'My custom title',
        }),
      ),
    )

    renderPanel()

    expect(
      screen.getByText(
        'Nové vygenerování přepíše ruční úpravy anglického textu.',
      ),
    ).toBeInTheDocument()
  })

  it('prevents duplicate translation requests while submitting', () => {
    useEntryTranslationQuery.mockReturnValue(
      createQueryResult(createTranslation('succeeded')),
    )
    useRequestEntryTranslationMutation.mockReturnValue({
      isPending: true,
      mutateAsync: requestMutateAsync,
    })

    renderPanel()

    expect(screen.getByTestId('entry-translation-status')).toHaveTextContent(
      'Překládám…',
    )
    expect(
      screen.queryByRole('button', { name: 'Vygenerovat znovu' }),
    ).not.toBeInTheDocument()
  })

  it('maps known invoke errors to localized messages', async () => {
    const user = userEvent.setup()
    useEntryTranslationQuery.mockReturnValue(createQueryResult(null))
    requestMutateAsync.mockRejectedValue(new Error('translation_failed'))

    renderPanel()

    await user.click(
      screen.getByRole('button', { name: 'Přeložit do angličtiny' }),
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Překlad se nepodařilo dokončit. Zkus to znovu.',
      )
    })
  })

  it('saves manual edits through the save mutation', async () => {
    const user = userEvent.setup()
    useEntryTranslationQuery.mockReturnValue(
      createQueryResult(createTranslation('succeeded')),
    )

    renderPanel()

    await user.clear(screen.getByLabelText('Anglický název'))
    await user.type(screen.getByLabelText('Anglický název'), 'Edited title')
    await user.clear(screen.getByLabelText('Anglický text'))
    await user.type(screen.getByLabelText('Anglický text'), 'Edited body.')
    await user.click(screen.getByRole('button', { name: 'Uložit úpravy' }))

    await waitFor(() => {
      expect(saveMutateAsync).toHaveBeenCalledWith({
        entryId,
        targetLocale: 'en',
        translatedBody: 'Edited body.',
        translatedTitle: 'Edited title',
        translationId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      })
    })
  })
})
