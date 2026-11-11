import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { createMemoryTriageItemStore } from '@/entities/media/api/triage-items.store'
import type { QueueSnapshot } from '@/features/media-import/api/upload-queue'
import { ImportFlow } from '@/features/media-import/ui/flow/ImportFlow'
import {
  DEMO_JOURNEY,
  DEMO_OWNER,
  seedItems,
} from '@/pages/dev/import-triage/demo-data'
import { createDemoTriageSource } from '@/pages/dev/import-triage/demo-source'
import {
  createFakeQueue,
  demoJob,
  snapshotOf,
} from '@/pages/dev/import-triage/fake-queue'

const NOW = Date.parse('2026-11-10T10:00:00.000Z')

function setup(
  options: {
    access?: 'authorized' | 'denied' | 'limited'
    snapshot?: QueueSnapshot
    stored?: ReturnType<typeof seedItems>
    total?: number
  } = {},
) {
  const store = createMemoryTriageItemStore(options.stored ?? [])
  const queue = createFakeQueue(options.snapshot ?? snapshotOf([], 'idle'))
  const enqueue = vi.spyOn(queue, 'enqueue')
  const start = vi.spyOn(queue, 'start')
  const source = createDemoTriageSource({
    access: options.access ?? 'authorized',
    total: options.total ?? 30,
  })
  const onClose = vi.fn()
  const onSort = vi.fn()
  render(
    <ImportFlow
      defaultRange={['2026-08-03', '2026-08-11']}
      journeyId={DEMO_JOURNEY}
      lastImportAt="2026-10-12T10:00:00.000Z"
      locale="cs"
      now={() => NOW}
      onClose={onClose}
      onSort={onSort}
      ownerId={DEMO_OWNER}
      queue={queue}
      snapshot={queue.getSnapshot()}
      source={source}
      starMedia={() => Promise.resolve()}
      store={store}
      timeZone="America/Edmonton"
    />,
  )
  return { enqueue, onClose, onSort, queue, source, start, store }
}

const button = (name: RegExp | string) => screen.getByRole('button', { name })

describe('ImportFlow', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('cs')
  })
  afterEach(cleanup)

  it('starts on the select screen with one primary action and two chips', async () => {
    setup()
    expect(
      await screen.findByRole('heading', { name: 'Co chceš přidat do cesty?' }),
    ).toBeTruthy()
    expect(button('Vybrat z knihovny')).toBeTruthy()
    expect(button(/Od posledního importu/)).toBeTruthy()
    expect(button('Rozsah dat')).toBeTruthy()
  })

  it('shows the denied screen instead of reading when access is denied', async () => {
    setup({ access: 'denied' })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Vybrat z knihovny' }),
    )
    expect(await screen.findByText('Aplikace nevidí tvoje fotky')).toBeTruthy()
    expect(button('Otevřít Nastavení')).toBeTruthy()
  })

  it('shows the limited-access banner before picking', async () => {
    setup({ access: 'limited' })
    expect(
      await screen.findByText('Aplikace vidí jen část knihovny'),
    ).toBeTruthy()
  })

  it('reads the library, shows the overview and persists found items', async () => {
    const { store } = setup()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Vybrat z knihovny' }),
    )
    expect(
      await screen.findByText('Z toho se už teď sestaví cesta'),
    ).toBeTruthy()
    await waitFor(async () => {
      expect((await store.listItems(DEMO_JOURNEY, DEMO_OWNER)).length).toBe(30)
    })
  })

  it('triages: a decision is remembered; upload with untriaged items asks first', async () => {
    const { enqueue, store } = setup()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Vybrat z knihovny' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Probrat' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Rychlé třídění' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Ponechat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pryč' }))
    await waitFor(async () => {
      const statuses = (await store.listItems(DEMO_JOURNEY, DEMO_OWNER)).map(
        (i) => i.status,
      )
      expect(statuses).toContain('kept')
      expect(statuses).toContain('dismissed')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zpět do mřížky' }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Nahrát 1 vybraných/ }),
    )
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText(/Zbývá probrat 28 fotek/)).toBeTruthy()
    // Nothing is uploaded silently.
    expect(enqueue).not.toHaveBeenCalled()
    fireEvent.click(
      within(sheet).getByRole('button', { name: /Nahrát jen vybrané \(1\)/ }),
    )
    await waitFor(() => {
      expect(enqueue).toHaveBeenCalledTimes(1)
    })
    const firstCall = enqueue.mock.calls[0]
    expect(firstCall?.[1]).toHaveLength(1)
  })

  it('"upload all" confirms with count and size before enqueueing everything', async () => {
    const { enqueue } = setup()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Vybrat z knihovny' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nahrát vše bez probírání' }),
    )
    const sheet = await screen.findByRole('dialog')
    expect(
      within(sheet).getByText(/Nahrát všech 30 bez probírání\?/),
    ).toBeTruthy()
    expect(enqueue).not.toHaveBeenCalled()
    fireEvent.click(
      within(sheet).getByRole('button', { name: /Nahrát všech 30/ }),
    )
    await waitFor(() => {
      expect(enqueue).toHaveBeenCalledTimes(1)
    })
    expect(enqueue.mock.calls[0]?.[1]).toHaveLength(30)
  })

  it('does not re-offer dismissed items and restores them from the dismissed list', async () => {
    const stored = seedItems({ statuses: { dismissed: 5, kept: 3 }, total: 30 })
    const { store } = setup({ stored })
    fireEvent.click(
      await screen
        .findByRole('button', { name: 'Pokračovat' })
        .catch(() => button(/Probírat dál/)),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Vyřazené 5/ }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Vrátit vše \(5\)/ }),
    )
    await waitFor(async () => {
      const items = await store.listItems(DEMO_JOURNEY, DEMO_OWNER)
      expect(items.filter((i) => i.status === 'dismissed')).toHaveLength(0)
    })
  })

  it('offers resume after a restart and can discard the unfinished work', async () => {
    const stored = seedItems({ statuses: { kept: 4 }, total: 30 })
    const { store } = setup({ stored })
    expect(await screen.findByText('Aplikace se mezitím zavřela')).toBeTruthy()
    fireEvent.click(button('Zahodit rozpracovaný import'))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Zahodit',
      }),
    )
    await waitFor(async () => {
      expect(await store.listItems(DEMO_JOURNEY, DEMO_OWNER)).toHaveLength(0)
    })
    expect(
      await screen.findByRole('heading', { name: 'Co chceš přidat do cesty?' }),
    ).toBeTruthy()
  })

  it('shows the paused screen with continue and cancel-the-rest', async () => {
    const stored = seedItems({ statuses: { kept: 4 }, total: 30 })
    const ids = stored.filter((i) => i.status === 'kept').map((i) => i.sourceId)
    const jobs = ids.map((id, i) => demoJob(id, i === 0 ? 'done' : 'paused'))
    setup({ snapshot: snapshotOf(jobs, 'paused'), stored })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Pokračovat v nahrávání' }),
    )
    expect(await screen.findByText('Pozastaveno')).toBeTruthy()
    expect(button('Zrušit zbývající')).toBeTruthy()
    expect(screen.getByText(/Zbylé fotky zůstanou v telefonu/)).toBeTruthy()
  })
})
