export const profileQueryKeys = {
  all: ['profiles'] as const,
  current: (userId: string | undefined) =>
    ['profiles', 'current', userId] as const,
  public: (username: string) => ['profiles', 'public', username] as const,
} as const
