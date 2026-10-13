import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import type { Tag } from '@/entities/tag/model/tag'
import { TagPickerDialog } from '@/features/moment-tags/ui/TagPickerDialog'

const suggestSpecies = vi.fn()
vi.mock('@/entities/tag/api/gbif-species', () => ({
  MIN_QUERY_LENGTH: 3,
  suggestSpecies: (...args: unknown[]) => suggestSpecies(...args) as unknown,
}))

afterEach(() => {
  cleanup()
  suggestSpecies.mockReset()
})

const tag = (id: string, kind: Tag['kind'], label: string, slug = id): Tag => ({
  gbifTaxonId: kind === 'species' ? 1 : null,
  id,
  kind,
  label,
  slug,
})
const fauna = tag('fauna', 'category', 'Fauna')
const rain = tag('rain', 'free', 'Déšť')

function setup(
  over: Partial<React.ComponentProps<typeof TagPickerDialog>> = {},
) {
  const props = {
    attached: [fauna],
    catalog: [fauna, tag('flora', 'category', 'Flóra'), rain],
    heading: 'Štítky',
    onAddFree: vi.fn(() => Promise.resolve(true)),
    onAddSpecies: vi.fn(() => Promise.resolve(true)),
    onClose: vi.fn(),
    onToggle: vi.fn(() => Promise.resolve(true)),
    ...over,
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TagPickerDialog {...props} />
    </QueryClientProvider>,
  )
  return props
}

describe('TagPickerDialog', () => {
  it('shows categories as toggles reflecting what is attached', () => {
    setup()
    expect(
      screen
        .getByRole('button', { name: 'Fauna' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen
        .getByRole('button', { name: 'Flóra' })
        .getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('toggles a category and a suggested free tag', async () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Fauna' }))
    await waitFor(() => {
      expect(props.onToggle).toHaveBeenCalledWith(fauna, true)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Déšť' }))
    await waitFor(() => {
      expect(props.onToggle).toHaveBeenCalledWith(rain, false)
    })
  })

  it('adds a free tag and clears the field; empty input does nothing', async () => {
    const props = setup()
    const input = screen.getByPlaceholderText('Např. západ slunce')
    fireEvent.submit(input.closest('form')!)
    expect(props.onAddFree).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'Západ slunce' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(props.onAddFree).toHaveBeenCalledWith('Západ slunce')
    })
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('')
    })
  })

  it('rejects a too long free tag with an alert', () => {
    const props = setup()
    const input = screen.getByPlaceholderText('Např. západ slunce')
    fireEvent.change(input, { target: { value: 'x'.repeat(121) } })
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByRole('alert').textContent).toContain('120')
    expect(props.onAddFree).not.toHaveBeenCalled()
  })

  it('searches species after a debounce and adds the chosen one', async () => {
    suggestSpecies.mockResolvedValue([
      {
        scientificName: 'Ursus arctos',
        taxonKey: 7,
        vernacularName: 'Medvěd hnědý',
      },
    ])
    const props = setup()
    fireEvent.change(screen.getByPlaceholderText('Např. medvěd grizzly'), {
      target: { value: 'ursus' },
    })
    const item = await screen.findByRole('button', { name: /Medvěd hnědý/ })
    expect(suggestSpecies).toHaveBeenCalledTimes(1)
    fireEvent.click(item)
    await waitFor(() => {
      expect(props.onAddSpecies).toHaveBeenCalledWith(
        expect.objectContaining({ taxonKey: 7 }),
      )
    })
  })

  it('shows an error when species search fails', async () => {
    suggestSpecies.mockRejectedValue(new Error('down'))
    setup()
    fireEvent.change(screen.getByPlaceholderText('Např. medvěd grizzly'), {
      target: { value: 'ursus' },
    })
    expect((await screen.findByRole('alert')).textContent).toContain('Druhy')
  })

  it('lists non-category tags with a remove button', async () => {
    const props = setup({ attached: [fauna, rain] })
    fireEvent.click(screen.getByRole('button', { name: 'Odebrat štítek Déšť' }))
    await waitFor(() => {
      expect(props.onToggle).toHaveBeenCalledWith(rain, true)
    })
  })
})
