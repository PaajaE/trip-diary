import '@/app/i18n'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyShareLink } from '@/features/sharing'

describe('CopyShareLink', () => {
  afterEach(cleanup)

  it('copies through the supplied callback and confirms success', async () => {
    const user = userEvent.setup()
    const onCopy = vi.fn().mockResolvedValue(undefined)
    render(<CopyShareLink onCopy={onCopy} />)

    await user.click(screen.getByRole('button', { name: 'Sdílet' }))

    expect(onCopy).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Odkaz zkopírován' }),
      ).toBeVisible()
    })
  })
})
