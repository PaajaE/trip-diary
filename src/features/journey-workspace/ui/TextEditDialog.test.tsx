import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { TextEditDialog } from '@/features/journey-workspace/ui/TextEditDialog'

afterEach(() => {
  cleanup()
})

async function setup(over: Partial<Parameters<typeof TextEditDialog>[0]> = {}) {
  await i18n.changeLanguage('en')
  const onClose = vi.fn()
  const onSave = vi.fn(() => Promise.resolve(true))
  render(
    <TextEditDialog
      heading="Edit text: Alps"
      initialBody="Old body"
      initialTitle="Alps"
      titleRequired
      onClose={onClose}
      onSave={onSave}
      {...over}
    />,
  )
  return { onClose, onSave }
}

const titleField = () => screen.getByLabelText('Title')
const bodyField = () => screen.getByLabelText('Text')

describe('TextEditDialog', () => {
  it('saves trimmed values and closes', async () => {
    const { onClose, onSave } = await setup()
    fireEvent.change(titleField(), { target: { value: '  New  ' } })
    fireEvent.change(bodyField(), { target: { value: 'Line 1\nLine 2 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce()
    })
    expect(onSave).toHaveBeenCalledWith({
      body: 'Line 1\nLine 2',
      title: 'New',
    })
  })

  it('saves with Ctrl+Enter', async () => {
    const { onSave } = await setup()
    fireEvent.change(bodyField(), { target: { value: 'Changed' } })
    fireEvent.keyDown(bodyField(), { ctrlKey: true, key: 'Enter' })
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce()
    })
  })

  it('shows an inline error for an empty segment title and does not save', async () => {
    const { onSave } = await setup()
    fireEvent.change(titleField(), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const error = await screen.findByText('The title is required.')
    expect(onSave).not.toHaveBeenCalled()
    expect(titleField().getAttribute('aria-describedby')).toBe(error.id)
  })

  it('turns an empty moment title into null', async () => {
    const { onSave } = await setup({
      initialTitle: 'Lunch',
      titleRequired: false,
    })
    fireEvent.change(titleField(), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ body: 'Old body', title: null })
    })
  })

  it('shows a live counter and rejects a too long body', async () => {
    const { onSave } = await setup()
    fireEvent.change(bodyField(), { target: { value: '😀😀' } })
    expect(screen.getByText('2 / 100000 characters')).toBeTruthy()
    fireEvent.change(bodyField(), { target: { value: 'x'.repeat(100_001) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByText('The text can have at most 100000 characters.'),
    ).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('closes without confirmation when nothing changed', async () => {
    const { onClose } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('asks before discarding a dirty draft (Cancel and Escape)', async () => {
    const { onClose } = await setup()
    fireEvent.change(bodyField(), { target: { value: 'Edited' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.getByText('You have unsaved changes. Discard them?'),
    ).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('stays open when saving fails', async () => {
    const onSave = vi.fn(() => Promise.resolve(false))
    const { onClose } = await setup({ onSave })
    fireEvent.change(bodyField(), { target: { value: 'Edited' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce()
    })
    expect(onClose).not.toHaveBeenCalled()
  })
})
