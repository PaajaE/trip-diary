export const tipQueryKeys = {
  all: ['tips'] as const,
  space: (spaceId: string) => ['tips', 'space', spaceId] as const,
} as const
