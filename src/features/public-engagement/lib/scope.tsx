import { useMemo, type ReactNode } from 'react'
import {
  ScopeContext,
  type PublicEngagementScopeValue,
} from '@/features/public-engagement/lib/scope-context'

/** Marks a subtree as one public journey; engagement UI renders only inside it. */
export function PublicEngagementScope({
  children,
  journeySlug,
  spaceHandle,
}: PublicEngagementScopeValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ journeySlug, spaceHandle }),
    [journeySlug, spaceHandle],
  )
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}
