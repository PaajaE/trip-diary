import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, seg, uuid } from '@/features/journey-workspace/test-fixtures'
import { WorkspaceOutline } from '@/features/journey-workspace/ui/WorkspaceOutline'

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void
let callback: Callback = () => undefined
const observed: string[] = []

class MockObserver {
  constructor(cb: Callback) {
    callback = cb
  }
  observe(element: Element) {
    observed.push(element.id)
  }
  disconnect() {
    return undefined
  }
}

function tree() {
  const stage = seg(1)
  const trip = seg(2, { kind: 'trip', parentId: stage.id })
  const m = mom(10, { title: 'Lake walk' })
  return buildWorkspaceTree([stage, trip], [m], [med(20, { momentId: m.id })])
}

function Host({ onNavigate }: { onNavigate: () => void }) {
  const t = tree()
  return (
    <div>
      <div id={`ws-segment-${t.roots[0]?.segment.id ?? ''}`} />
      <div
        id={`ws-moment-${t.roots[0]?.children[0]?.moments[0]?.moment.id ?? ''}`}
      />
      <WorkspaceOutline
        observeKey={0}
        placeNames={new Map()}
        tree={t}
        onNavigate={onNavigate}
      />
    </div>
  )
}

describe('WorkspaceOutline', () => {
  beforeEach(async () => {
    observed.length = 0
    vi.stubGlobal('IntersectionObserver', MockObserver)
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders stages, trips and moments with photo counts', () => {
    render(<Host onNavigate={vi.fn()} />)
    expect(screen.getByRole('navigation', { name: 'Outline' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Segment 1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Segment 2/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Lake walk/ })).toBeTruthy()
    expect(screen.getAllByText('1 photo').length).toBeGreaterThan(0)
  })

  it('reports the target and the segments to expand on click', () => {
    const onNavigate = vi.fn()
    render(<Host onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: /Lake walk/ }))
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        elementId: expect.stringMatching(/^ws-moment-/) as string,
        expand: [seg(1).id, seg(2).id],
        momentId: mom(10).id,
      }),
    )
    expect(screen.getByRole('button', { name: /Lake walk/ })).toHaveAttribute(
      'aria-current',
      'location',
    )
  })

  it('highlights the moment reported visible by the IntersectionObserver', () => {
    render(<Host onNavigate={vi.fn()} />)
    expect(observed).toContain(`ws-moment-${mom(10).id}`)
    expect(
      screen.getByRole('button', { name: /Lake walk/ }),
    ).not.toHaveAttribute('aria-current')
    act(() => {
      callback([
        {
          isIntersecting: true,
          target: document.getElementById(`ws-moment-${mom(10).id}`) as Element,
        },
      ])
    })
    expect(screen.getByRole('button', { name: /Lake walk/ })).toHaveAttribute(
      'aria-current',
      'location',
    )
  })

  describe('days and places', () => {
    const PLACE = uuid(500)
    function multiDay() {
      const stage1 = seg(1, { title: 'Alberta' })
      const stage2 = seg(2, {
        endsAt: '2026-02-10T00:00:00+00:00',
        startsAt: '2026-02-01T00:00:00+00:00',
        title: 'Yukon',
      })
      const a = mom(10, {
        placeId: PLACE,
        startsAt: '2026-01-02T08:23:00+00:00',
      })
      const b = mom(11, { startsAt: '2026-01-03T08:23:00+00:00' })
      const c = mom(12, {
        startsAt: '2026-02-02T08:23:00+00:00',
        title: 'Dawson walk',
      })
      return buildWorkspaceTree(
        [stage1, stage2],
        [a, b, c],
        [
          med(20, { momentId: a.id }),
          med(21, { momentId: a.id }),
          med(22, { momentId: b.id }),
        ],
      )
    }
    function renderIt(onNavigate = vi.fn()) {
      return render(
        <WorkspaceOutline
          observeKey={0}
          placeNames={new Map([[PLACE, 'Banff']])}
          tree={multiDay()}
          onNavigate={onNavigate}
        />,
      )
    }

    it('shows day rows with date, place and photo count; moments by place', () => {
      renderIt()
      expect(
        screen.getByRole('button', { name: /Fri.*Jan 2.*Banff/ }),
      ).toBeTruthy()
      expect(
        screen.getByRole('button', { name: /^09:23.* Banff/ }),
      ).toBeTruthy()
      expect(screen.getByText('Place names © Seznam.cz a.s.')).toBeTruthy()
    })

    it('opens only the stage that holds the current row', () => {
      renderIt()
      expect(screen.queryByRole('button', { name: /Dawson walk/ })).toBeNull()
      fireEvent.click(
        screen.getByRole('button', { name: /Expand in outline: Yukon/ }),
      )
      expect(screen.queryByRole('button', { name: /Dawson walk/ })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /Mon.*Feb 2/ }))
      expect(screen.getByRole('button', { name: /Dawson walk/ })).toBeTruthy()
    })

    it('scrolls to the first moment of a day', () => {
      const onNavigate = vi.fn()
      renderIt(onNavigate)
      fireEvent.click(screen.getByRole('button', { name: /Fri.*Jan 2/ }))
      expect(onNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          elementId: expect.stringMatching(/^ws-day-/) as string,
          momentId: mom(10).id,
        }),
      )
    })

    it('filters by place and by title', () => {
      renderIt()
      const input = screen.getByRole('searchbox', { name: 'Filter outline' })
      fireEvent.change(input, { target: { value: 'banff' } })
      expect(
        screen.getByRole('button', { name: /^09:23.* Banff/ }),
      ).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Sat/ })).toBeNull()
      fireEvent.change(input, { target: { value: 'dawson' } })
      expect(screen.getByRole('button', { name: /Dawson walk/ })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Banff/ })).toBeNull()
    })
  })
})
