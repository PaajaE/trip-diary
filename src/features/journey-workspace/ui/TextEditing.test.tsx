import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import { mom, seg } from '@/features/journey-workspace/test-fixtures'
import {
  ClampedBody,
  MomentTextEditor,
  SegmentTextEditor,
} from '@/features/journey-workspace/ui/TextEditing'

afterEach(() => {
  cleanup()
})

describe('TextEditing', () => {
  it('renders nothing for an empty body and toggles a long one', async () => {
    await i18n.changeLanguage('en')
    const empty = render(<ClampedBody body="" />)
    expect(empty.container.textContent).toBe('')
    cleanup()
    render(<ClampedBody body={'a\nb\nc\nd'} />)
    const text = screen.getByTestId('workspace-body')
    expect(text.className).toContain('line-clamp-3')
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(text.className).not.toContain('line-clamp-3')
  })

  it('opens the dialog for a segment and saves through the repository hook', async () => {
    await i18n.changeLanguage('en')
    const saveSegmentText = vi.fn(() => Promise.resolve(true))
    const edits = { saveSegmentText } as unknown as WorkspaceEdits
    const segment = seg(1, { body: 'hi', title: 'Alps' })
    render(<SegmentTextEditor edits={edits} segment={segment} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit text: Alps' }))
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Alps 2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => {
      expect(saveSegmentText).toHaveBeenCalledWith(segment, {
        body: 'hi',
        title: 'Alps 2',
      })
    })
  })

  it('passes a null title for a moment', async () => {
    await i18n.changeLanguage('en')
    const saveMomentText = vi.fn(() => Promise.resolve(true))
    const edits = { saveMomentText } as unknown as WorkspaceEdits
    const moment = mom(10, { title: 'Lunch' })
    render(<MomentTextEditor edits={edits} moment={moment} name="Lunch" />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit text: Lunch' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => {
      expect(saveMomentText).toHaveBeenCalledWith(moment, {
        body: '',
        title: null,
      })
    })
  })
})
