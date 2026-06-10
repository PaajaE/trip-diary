import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CreateFamilyForm,
  CreateInviteForm,
  MembersList,
  SpaceSwitcher,
  type SpaceMemberViewModel,
  type SpaceSwitcherItem,
} from '@/features/spaces'

const spaces: SpaceSwitcherItem[] = [
  {
    handle: 'pavel',
    id: 'personal',
    kind: 'personal',
    name: 'Pavel',
  },
  {
    handle: 'ecerovi2016',
    id: 'family',
    kind: 'family',
    name: 'Ečerovi',
  },
]

const members: SpaceMemberViewModel[] = [
  {
    canChangeRole: false,
    canRemove: false,
    displayName: 'Pavel Ečer',
    id: 'owner',
    isCurrentUser: true,
    role: 'owner',
    username: 'pavel',
  },
  {
    canChangeRole: true,
    canRemove: true,
    displayName: 'Jana Ečerová',
    id: 'member',
    role: 'member',
    username: 'jana',
  },
]

describe('spaces presentation components', () => {
  afterEach(cleanup)

  it('switches the active publishing space and opens family creation', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onCreateFamily = vi.fn()
    render(
      <SpaceSwitcher
        activeSpaceId="personal"
        onCreateFamily={onCreateFamily}
        onSelect={onSelect}
        spaces={spaces}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Pavel/ }))
    await user.click(screen.getByRole('button', { name: /Ečerovi/ }))
    expect(onSelect).toHaveBeenCalledWith('family')

    await user.click(screen.getByRole('button', { name: /Pavel/ }))
    await user.click(
      screen.getByRole('button', { name: 'Vytvořit rodinný prostor' }),
    )
    expect(onCreateFamily).toHaveBeenCalledOnce()
  })

  it('normalizes and submits a new family handle', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateFamilyForm onCreate={onCreate} />)

    await user.type(
      screen.getByLabelText('Název rodiny nebo skupiny'),
      'Naše výpravy',
    )
    expect(screen.getByLabelText('Veřejná adresa')).toHaveValue('nase-vypravy')
    await user.click(
      screen.getByRole('button', { name: 'Vytvořit rodinný prostor' }),
    )

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        handle: 'nase-vypravy',
        name: 'Naše výpravy',
      })
    })
  })

  it('offers permitted member actions through callbacks', async () => {
    const user = userEvent.setup()
    const onChangeRole = vi.fn()
    const onRemove = vi.fn()
    render(
      <MembersList
        members={members}
        onChangeRole={onChangeRole}
        onRemove={onRemove}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Akce pro Pavel Ečer' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Akce pro Jana Ečerová' }),
    )
    await user.selectOptions(
      screen.getByLabelText('Role uživatele Jana Ečerová'),
      'editor',
    )
    expect(onChangeRole).toHaveBeenCalledWith('member', 'editor')

    await user.click(
      screen.getByRole('button', { name: 'Akce pro Jana Ečerová' }),
    )
    await user.click(screen.getByRole('button', { name: 'Odebrat z prostoru' }))
    expect(onRemove).toHaveBeenCalledWith('member')
  })

  it('returns an invite link and copies it through the supplied callback', async () => {
    const user = userEvent.setup()
    const link = 'https://cestovni-denik.cz/invite/secret'
    const onCreateInvite = vi.fn().mockResolvedValue(link)
    const onCopyInviteLink = vi.fn().mockResolvedValue(undefined)
    render(
      <CreateInviteForm
        onCopyInviteLink={onCopyInviteLink}
        onCreateInvite={onCreateInvite}
      />,
    )

    await user.type(screen.getByLabelText('E-mail člena'), 'jana@example.cz')
    await user.selectOptions(screen.getByLabelText('Role'), 'editor')
    await user.click(screen.getByRole('button', { name: 'Vytvořit pozvánku' }))

    expect(await screen.findByText(link)).toBeVisible()
    expect(onCreateInvite).toHaveBeenCalledWith({
      email: 'jana@example.cz',
      role: 'editor',
    })
    await user.click(screen.getByRole('button', { name: 'Kopírovat odkaz' }))
    expect(onCopyInviteLink).toHaveBeenCalledWith(link)
    expect(
      screen.getByRole('button', { name: 'Odkaz zkopírován' }),
    ).toBeVisible()
  })
})
