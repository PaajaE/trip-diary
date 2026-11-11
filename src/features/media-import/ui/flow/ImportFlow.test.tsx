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
    starMedia?: (mediaId: string) => Promise<void>
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
      starMedia={options.starMedia ?? (() => Promise.resolve())}
      store={store}
      timeZone="Europe/Prague"
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

  it('quick sort undo restores the previous state exactly once per decision', async () => {
    const { store } = setup()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Vybrat z knihovny' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Probrat' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Rychlé třídění' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Ponechat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pryč' }))
    expect(screen.getByText('3 z 30')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Zpět' }))
    expect(screen.getByText('2 z 30')).toBeTruthy()
    await waitFor(async () => {
      const statuses = (await store.listItems(DEMO_JOURNEY, DEMO_OWNER)).map(
        (i) => i.status,
      )
      expect(statuses.filter((x) => x === 'kept')).toHaveLength(1)
      expect(statuses.filter((x) => x === 'dismissed')).toHaveLength(0)
    })
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

  it('restores a dismissed item of an earlier read into the working set', async () => {
    const stored = seedItems({
      dismissedBefore: 3,
      statuses: { kept: 2 },
      total: 30,
    })
    const { store } = setup({ stored })
    fireEvent.click(await screen.findByRole('button', { name: 'Probírat dál' }))
    fireEvent.click(await screen.findByRole('button', { name: /Vyřazené 0/ }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Vrátit vše \(3\)/ }),
    )
    await waitFor(async () => {
      const items = await store.listItems(DEMO_JOURNEY, DEMO_OWNER)
      expect(
        items.filter(
          (i) => i.sourceId.startsWith('old-') && i.status === 'found',
        ),
      ).toHaveLength(3)
    })
    // Back in the grid the restored photos count as found (not lost).
    fireEvent.click(screen.getByRole('button', { name: 'Zpět na přehled' }))
    fireEvent.click(await screen.findByRole('button', { name: /Nalezené 31/ }))
  })

  it('keeps open items of an older read in the grid (never stranded)', async () => {
    const stored = seedItems({ statuses: { kept: 6 }, total: 30 }).map((i) => ({
      ...i,
      selectionId: '2026-10-01T00:00:00.000Z-older',
    }))
    const base = stored[0]
    if (base !== undefined) {
      stored.push({
        ...base,
        id: 'newer',
        selectionId: '2026-11-09T00:00:00.000Z-newer',
        sourceId: 'newer-1',
        status: 'dismissed',
      })
    }
    setup({ stored })
    fireEvent.click(await screen.findByRole('button', { name: 'Probírat dál' }))
    expect(
      await screen.findByRole('button', { name: /Ponechané 6/ }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /Nalezené 24/ })).toBeTruthy()
  })

  it('writes the star after the upload finished, once, and marks the item uploaded', async () => {
    const stored = seedItems({ statuses: { starred: 2 }, total: 30 })
    const ids = stored
      .filter((i) => i.status === 'starred')
      .map((i) => i.sourceId)
    const jobs = ids.map((id) =>
      demoJob(id, 'done', { mediaId: `media-${id}` }),
    )
    const starMedia = vi.fn(() => Promise.resolve())
    const { store } = setup({
      snapshot: snapshotOf(jobs, 'idle'),
      starMedia,
      stored,
    })
    await waitFor(() => {
      expect(starMedia).toHaveBeenCalledTimes(2)
    })
    expect(starMedia).toHaveBeenCalledWith(`media-${ids[0] ?? ''}`)
    await waitFor(async () => {
      const items = (await store.listItems(DEMO_JOURNEY, DEMO_OWNER)).filter(
        (i) => ids.includes(i.sourceId),
      )
      expect(
        items.every((i) => i.status === 'uploaded' && !i.bestPending),
      ).toBe(true)
    })
  })

  it('with the iCloud switch off, iCloud-only kept items are not enqueued and stay kept', async () => {
    const stored = seedItems({ statuses: { kept: 4 }, total: 30 }).map(
      (i, n) =>
        i.status === 'kept' && n % 2 === 0 ? { ...i, icloudOnly: true } : i,
    )
    const cloudCount = stored.filter(
      (i) => i.status === 'kept' && i.icloudOnly,
    ).length
    const keptCount = stored.filter((i) => i.status === 'kept').length
    expect(cloudCount).toBeGreaterThan(0)
    const { enqueue, store } = setup({ stored })
    fireEvent.click(await screen.findByRole('button', { name: 'Probírat dál' }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Nahrát \d+ vybraných/ }),
    )
    const sheet = await screen.findByRole('dialog')
    fireEvent.click(within(sheet).getByRole('switch'))
    fireEvent.click(
      within(sheet).getByRole('button', { name: /Nahrát jen vybrané/ }),
    )
    await waitFor(() => {
      expect(enqueue).toHaveBeenCalledTimes(1)
    })
    expect(enqueue.mock.calls[0]?.[1]).toHaveLength(keptCount - cloudCount)
    const after = await store.listItems(DEMO_JOURNEY, DEMO_OWNER)
    expect(
      after.filter((i) => i.status === 'kept' && i.icloudOnly),
    ).toHaveLength(cloudCount)
  })

  it("days follow the photo's zone and items without a position are marked", async () => {
    // 21:30 in Banff on Aug 4 = Aug 5 in a device zone ahead of UTC.
    const base = seedItems({ statuses: { kept: 1 }, total: 4 }).map((i, n) => ({
      ...i,
      capturedAt: '2026-08-05T03:30:00.000Z',
      latitude: n === 0 ? null : 51.18,
      longitude: n === 0 ? null : -115.57,
    }))
    setup({ stored: base })
    fireEvent.click(await screen.findByRole('button', { name: 'Probírat dál' }))
    expect(await screen.findAllByText(/4\. 8\./)).not.toHaveLength(0)
    // Only the item without a position falls back to the device day.
    expect(screen.getAllByText(/5\. 8\./)).toHaveLength(1)
    expect(screen.getByText(/1 bez polohy, čas zařízení/)).toBeTruthy()
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
