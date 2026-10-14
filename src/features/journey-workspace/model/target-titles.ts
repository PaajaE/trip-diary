import type { WorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'

/** Titles of segments and moments by id, for labelling pending comments. */
export function targetTitles(tree: WorkspaceTree): Map<string, string> {
  const titles = new Map<string, string>()
  const walkMoments = (moments: WorkspaceTree['looseMoments']) => {
    for (const { moment } of moments) {
      if (moment.title !== null) titles.set(moment.id, moment.title)
    }
  }
  const walk = (nodes: WorkspaceTree['roots']) => {
    for (const node of nodes) {
      titles.set(node.segment.id, node.segment.title)
      walkMoments(node.moments)
      walk(node.children)
    }
  }
  walkMoments(tree.looseMoments)
  walk(tree.roots)
  return titles
}
