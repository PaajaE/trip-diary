export const spaceQueryKeys = {
  all: ['spaces'] as const,
  byUser: (userId: string | undefined) => ['spaces', userId] as const,
  members: (spaceId: string) => ['spaces', spaceId, 'members'] as const,
  invitePreview: (token: string) => ['space-invite-preview', token] as const,
} as const
