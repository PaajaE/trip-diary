import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

type Kind = 'journey' | 'stage' | 'trip' | 'moment' | 'media'
type TripType = 'trek' | 'day' | 'transfer' | 'stay'

interface Node {
  kind: Kind
  label: string
  tripType?: TripType
  children?: readonly Node[]
}

const KIND_STYLE: Record<Kind, string> = {
  journey: 'bg-primary text-primary-foreground',
  stage: 'bg-primary/15 text-primary',
  trip: 'bg-accent/15 text-accent-strong',
  moment: 'bg-border text-foreground',
  media: 'border border-border text-muted',
}

export function StructureExample() {
  const { t } = useTranslation()
  const ex = (key: string) => t(`home.structure.example.${key}`)

  const tree: Node = {
    kind: 'journey',
    label: ex('journey'),
    children: [
      {
        kind: 'stage',
        label: ex('okanagan'),
        children: [{ kind: 'trip', label: ex('workaway'), tripType: 'stay' }],
      },
      {
        kind: 'stage',
        label: ex('north'),
        children: [
          { kind: 'trip', label: ex('cassiar'), tripType: 'transfer' },
          { kind: 'trip', label: ex('salmon'), tripType: 'day' },
        ],
      },
      {
        kind: 'stage',
        label: ex('rockies'),
        children: [
          {
            kind: 'trip',
            label: ex('magog'),
            tripType: 'trek',
            children: [
              {
                kind: 'moment',
                label: ex('dusk'),
                children: [{ kind: 'media', label: ex('media') }],
              },
            ],
          },
        ],
      },
    ],
  }

  return (
    <figure
      aria-label={t('home.structure.exampleLabelFor')}
      className="rounded-3xl border border-border/80 bg-surface p-5 shadow-soft sm:p-7"
    >
      <figcaption className="mb-4 text-[0.6875rem] font-semibold tracking-[0.18em] text-muted uppercase">
        {t('home.structure.exampleLabel')}
      </figcaption>
      <TreeNode node={tree} root />
    </figure>
  )
}

function TreeNode({ node, root = false }: { node: Node; root?: boolean }) {
  const { t } = useTranslation()

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold',
            KIND_STYLE[node.kind],
          )}
        >
          {t(`home.structure.kinds.${node.kind}`)}
        </span>
        <span
          className={cn(
            'text-sm font-semibold sm:text-base',
            node.kind === 'journey' && 'reader-display text-lg',
          )}
        >
          {node.label}
        </span>
        {node.tripType === undefined ? null : (
          <span className="text-xs text-muted">
            · {t(`home.structure.tripTypes.${node.tripType}`)}
          </span>
        )}
      </div>
      {node.children === undefined ? null : (
        <ul
          className={cn(
            'space-y-0.5 border-l border-border pl-4',
            root ? 'ml-2' : 'ml-2 sm:ml-3',
          )}
        >
          {node.children.map((child) => (
            <li key={`${child.kind}-${child.label}`}>
              <TreeNode node={child} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
