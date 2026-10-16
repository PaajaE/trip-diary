import type { ReactNode } from 'react'
import {
  CreateFamilyForm,
  SpaceSwitcher,
  type CreateFamilyValues,
  type SpaceSwitcherItem,
} from '@/features/spaces'
import {
  Card,
  PageContainer,
  PageHeader,
  SectionHeading,
} from '@/shared/ui/PageLayout'

interface SpacesPageProps {
  activeSpaceId: string
  creatingFamily: boolean
  /** Extra content below the page (for example a link to member management). */
  footer?: ReactNode
  onCancelCreate: () => void
  onCreateFamily: (values: CreateFamilyValues) => Promise<void>
  onOpenCreate: () => void
  onSelectSpace: (spaceId: string) => void
  spaces: SpaceSwitcherItem[]
}

export function SpacesPage({
  activeSpaceId,
  creatingFamily,
  footer,
  onCancelCreate,
  onCreateFamily,
  onOpenCreate,
  onSelectSpace,
  spaces,
}: SpacesPageProps) {
  return (
    <PageContainer>
      <PageHeader
        description="Přepínejte mezi svým deníkem a místy, která tvoříte společně."
        title="Rodinné prostory"
      />
      <div className="space-y-10">
        <section>
          <SectionHeading>Aktivní prostor</SectionHeading>
          <SpaceSwitcher
            activeSpaceId={activeSpaceId}
            onCreateFamily={onOpenCreate}
            onSelect={onSelectSpace}
            spaces={spaces}
          />
        </section>
        {creatingFamily ? (
          <section>
            <SectionHeading description="Vytvořte společný domov pro cesty, vzpomínky a praktické tipy.">
              Nový rodinný prostor
            </SectionHeading>
            <Card>
              <CreateFamilyForm
                onCancel={onCancelCreate}
                onCreate={onCreateFamily}
              />
            </Card>
          </section>
        ) : null}
        {footer}
      </div>
    </PageContainer>
  )
}
