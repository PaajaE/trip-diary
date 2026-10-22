import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { DayNoteEditor } from '@/features/journey-workspace/ui/day/DayNoteEditor'

beforeAll(async () => {
  await i18n.changeLanguage('en')
})
afterEach(cleanup)

describe('DayNoteEditor', () => {
  it('shows the placeholder and saves trimmed text on blur', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(<DayNoteEditor canEdit dated value={null} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Day note' }))
    const area = await screen.findByRole('textbox')
    fireEvent.change(area, { target: { value: '  Cold start.  ' } })
    fireEvent.blur(area)
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith('Cold start.')
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Day note saved',
    )
  })

  it('saves once with the Save button', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(<DayNoteEditor canEdit dated value="Old" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Day note' }))
    const area = await screen.findByRole('textbox')
    fireEvent.change(area, { target: { value: 'New' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('New')
    })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('does not save unchanged text and sends empty text to delete', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(<DayNoteEditor canEdit dated value="Old" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Day note' }))
    fireEvent.blur(await screen.findByRole('textbox'))
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull()
    })
    expect(onSave).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Day note' }))
    const area = await screen.findByRole('textbox')
    fireEvent.change(area, { target: { value: '   ' } })
    fireEvent.blur(area)
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('')
    })
  })

  it('keeps the draft open and reports a failed save', async () => {
    const onSave = vi.fn().mockResolvedValue(false)
    render(<DayNoteEditor canEdit dated value={null} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Day note' }))
    const area = await screen.findByRole('textbox')
    fireEvent.change(area, { target: { value: 'Text' } })
    fireEvent.blur(area)
    expect(
      await screen.findByText('The day note could not be saved.'),
    ).toBeTruthy()
    expect(screen.getByRole('textbox')).toHaveValue('Text')
  })

  it('is read-only without edit rights and disabled for an undated day', () => {
    const { rerender } = render(
      <DayNoteEditor canEdit={false} dated value="Text" onSave={vi.fn()} />,
    )
    expect(screen.getByText('Text')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    rerender(
      <DayNoteEditor canEdit dated={false} value={null} onSave={vi.fn()} />,
    )
    expect(
      screen.getByText('A day without a date cannot have a note.'),
    ).toBeTruthy()
  })
})
