import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, seg } from '@/features/journey-workspace/test-fixtures'
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
        momentLabel={(entry) => entry.moment.title ?? 'untitled'}
        observeKey={0}
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
    expect(screen.getByRole('button', { name: /Segment 1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Segment 2/ })).toBeTruthy()
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
})
