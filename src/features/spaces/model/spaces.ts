export type SpaceKind = 'personal' | 'family'

export type SpaceRole = 'owner' | 'editor' | 'member'

export interface SpaceSwitcherItem {
  avatarUrl?: string | null
  handle: string
  id: string
  kind: SpaceKind
  name: string
}

export interface SpaceMemberViewModel {
  avatarUrl?: string | null
  canChangeRole: boolean
  canRemove: boolean
  displayName: string
  id: string
  isCurrentUser?: boolean
  role: SpaceRole
  username?: string | null
}

export interface CreateFamilyValues {
  handle: string
  name: string
}

export interface CreateInviteValues {
  email: string
  role: Exclude<SpaceRole, 'owner'>
}

export interface InviteSpaceViewModel {
  avatarUrl?: string | null
  handle: string
  name: string
}

export type AcceptInviteState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'ready'; space: InviteSpaceViewModel }
  | { status: 'accepting'; space: InviteSpaceViewModel }
  | { status: 'accepted'; space: InviteSpaceViewModel }
  | { message?: string; status: 'error'; space?: InviteSpaceViewModel }

export const spaceRoleLabels: Record<SpaceRole, string> = {
  editor: 'Editor',
  member: 'Člen',
  owner: 'Vlastník',
}

export function normalizeSpaceHandle(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function validateSpaceHandle(value: string) {
  return /^[a-z0-9][a-z0-9-]{2,39}$/.test(value)
}
