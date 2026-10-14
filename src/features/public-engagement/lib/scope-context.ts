import { createContext, useContext } from 'react'

export interface PublicEngagementScopeValue {
  journeySlug: string
  spaceHandle: string
}

export const ScopeContext = createContext<PublicEngagementScopeValue | null>(
  null,
)

export function usePublicEngagementScope(): PublicEngagementScopeValue | null {
  return useContext(ScopeContext)
}
