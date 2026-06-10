import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/entities/profile/model/profile'
import { ProfileSettingsForm } from '@/features/profile/ui/ProfileSettingsForm'

const userId = 'e7a8d51b-e975-46aa-965c-1d52c54fa119'
const profile: Profile = {
  avatarUrl: null,
  bio: 'Na cestě od roku 2016.',
  displayName: 'Ečerovi',
  id: userId,
  username: 'ecerovi2016',
}

describe('ProfileSettingsForm', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:avatar-preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('submits edited profile values and the selected avatar', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <ProfileSettingsForm
        onSave={onSave}
        preferredLocale="cs"
        profile={profile}
        userId={userId}
      />,
    )

    await user.clear(screen.getByLabelText('Zobrazované jméno'))
    await user.type(screen.getByLabelText('Zobrazované jméno'), 'Pavel Ečer')
    await user.selectOptions(screen.getByLabelText('Preferovaný jazyk'), 'en')
    const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Vybrat fotografii'), {
      target: { files: [avatar] },
    })
    await user.click(screen.getByRole('button', { name: 'Uložit profil' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarFile: avatar,
          displayName: 'Pavel Ečer',
          preferredLocale: 'en',
          userId,
          username: 'ecerovi2016',
        }),
      )
    })
    expect(screen.getByText('Profil je uložený.')).toBeVisible()
  })

  it('validates the public username before saving', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <ProfileSettingsForm onSave={onSave} profile={profile} userId={userId} />,
    )

    await user.clear(screen.getByLabelText('Uživatelské jméno'))
    await user.type(screen.getByLabelText('Uživatelské jméno'), 'Ne platí')
    await user.click(screen.getByRole('button', { name: 'Uložit profil' }))

    expect(
      await screen.findByText(
        'Použijte pouze malá písmena bez diakritiky, čísla a podtržítka.',
      ),
    ).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows loading and error states while saving', async () => {
    const user = userEvent.setup()
    let rejectSave: ((reason?: unknown) => void) | undefined
    const onSave = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject
        }),
    )
    render(
      <ProfileSettingsForm onSave={onSave} profile={profile} userId={userId} />,
    )

    await user.click(screen.getByRole('button', { name: 'Uložit profil' }))
    expect(screen.getByRole('button', { name: 'Ukládám…' })).toBeDisabled()

    rejectSave?.(new Error('save failed'))
    expect(
      await screen.findByText(
        'Profil se nepodařilo uložit. Zkuste to prosím znovu.',
      ),
    ).toBeVisible()
  })
})
