import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/entities/profile/model/profile'
import { SettingsPage } from '@/pages/settings/SettingsPage'

const profile: Profile = {
  avatarUrl: 'https://example.com/avatar.webp',
  bio: null,
  displayName: 'Ečerovi',
  id: 'e7a8d51b-e975-46aa-965c-1d52c54fa119',
  username: 'ecerovi2016',
}

describe('SettingsPage', () => {
  afterEach(cleanup)

  it('presents the current profile in a mobile-friendly settings form', () => {
    render(
      <SettingsPage onSave={vi.fn()} profile={profile} userId={profile.id} />,
    )

    expect(
      screen.getByRole('heading', { name: 'Nastavení profilu' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Uživatelské jméno')).toHaveValue(
      'ecerovi2016',
    )
    expect(screen.getByLabelText('Zobrazované jméno')).toHaveValue('Ečerovi')
    expect(screen.getByRole('button', { name: 'Uložit profil' })).toHaveClass(
      'w-full',
    )
  })
})
