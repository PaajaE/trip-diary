export const engagementQueryKeys = {
  all: ['engagement'] as const,
  targetPrefix: (type: string, id: string) =>
    ['engagement', type, id] as const,
  detail: (type: string, id: string, viewerKey: string) =>
    ['engagement', type, id, viewerKey] as const,
} as const
