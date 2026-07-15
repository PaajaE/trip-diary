export const journeyQueryKeys = {
  all: ['journeys'] as const,
  detail: (journeyId: string) => ['journeys', journeyId] as const,
  detailLocal: (journeyId: string) => ['journeys', journeyId, 'local'] as const,
  publicAll: ['public-journeys'] as const,
  publicDetail: (journeyId: string) => ['public-journeys', journeyId] as const,
  contributionAll: ['journey-contribution'] as const,
  contribution: (journeyId: string) =>
    ['journey-contribution', journeyId] as const,
  contributionLocal: (journeyId: string) =>
    ['journey-contribution', journeyId, 'local'] as const,
  owner: (journeyId: string) => ['journey-owner', journeyId] as const,
  myRole: (journeyId: string, userId: string | undefined) =>
    ['journey-my-role', journeyId, userId] as const,
  members: (journeyId: string) => ['journey-members', journeyId] as const,
  pendingInvites: (journeyId: string) =>
    ['journey-pending-invites', journeyId] as const,
  invitePreview: (token: string) => ['journey-invite-preview', token] as const,
  publicPaths: (journeyId: string) =>
    ['journey-public-paths', journeyId] as const,
} as const
