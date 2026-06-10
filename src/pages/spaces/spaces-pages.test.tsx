import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AcceptInvitePage } from '@/pages/spaces/AcceptInvitePage'
import { SpaceMembersPage } from '@/pages/spaces/SpaceMembersPage'
import { SpacesPage } from '@/pages/spaces/SpacesPage'

describe('spaces pages', () => {
  afterEach(cleanup)

  it('presents family creation without owning its integration state', async () => {
    const user = userEvent.setup()
    const onOpenCreate = vi.fn()
    render(
      <SpacesPage
        activeSpaceId="personal"
        creatingFamily={false}
        onCancelCreate={vi.fn()}
        onCreateFamily={vi.fn()}
        onOpenCreate={onOpenCreate}
        onSelectSpace={vi.fn()}
        spaces={[
          {
            handle: 'pavel',
            id: 'personal',
            kind: 'personal',
            name: 'Pavel',
          },
        ]}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Rodinné prostory' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Pavel/ }))
    await user.click(
      screen.getByRole('button', { name: 'Vytvořit rodinný prostor' }),
    )
    expect(onOpenCreate).toHaveBeenCalledOnce()
  })

  it('presents member management and invite creation together', () => {
    render(
      <SpaceMembersPage
        members={[]}
        onChangeRole={vi.fn()}
        onCopyInviteLink={vi.fn()}
        onCreateInvite={vi.fn()}
        onRemove={vi.fn()}
        spaceName="Ečerovi"
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Členové prostoru' }),
    ).toBeVisible()
    expect(screen.getByLabelText('E-mail člena')).toBeVisible()
    expect(
      screen.getByText('V tomto prostoru zatím nejsou žádní členové.'),
    ).toBeVisible()
  })

  it('handles ready, signed-out and accepted invite states', async () => {
    const user = userEvent.setup()
    const onAccept = vi.fn()
    const onSignIn = vi.fn()
    const onContinue = vi.fn()
    const view = render(
      <AcceptInvitePage
        onAccept={onAccept}
        onContinue={onContinue}
        onSignIn={onSignIn}
        signedIn={false}
        state={{
          space: { handle: 'ecerovi2016', name: 'Ečerovi' },
          status: 'ready',
        }}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Přihlásit se a přijmout' }),
    )
    expect(onSignIn).toHaveBeenCalledOnce()

    view.rerender(
      <AcceptInvitePage
        onAccept={onAccept}
        onContinue={onContinue}
        onSignIn={onSignIn}
        signedIn
        state={{
          space: { handle: 'ecerovi2016', name: 'Ečerovi' },
          status: 'ready',
        }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Přijmout pozvánku' }))
    expect(onAccept).toHaveBeenCalledOnce()

    view.rerender(
      <AcceptInvitePage
        onAccept={onAccept}
        onContinue={onContinue}
        onSignIn={onSignIn}
        signedIn
        state={{
          space: { handle: 'ecerovi2016', name: 'Ečerovi' },
          status: 'accepted',
        }}
      />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Pokračovat do prostoru' }),
    )
    expect(onContinue).toHaveBeenCalledOnce()
  })
})
