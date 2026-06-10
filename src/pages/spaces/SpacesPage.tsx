import {
  CreateFamilyForm,
  SpaceSwitcher,
  type CreateFamilyValues,
  type SpaceSwitcherItem,
} from '@/features/spaces'

interface SpacesPageProps {
  activeSpaceId: string
  creatingFamily: boolean
  onCancelCreate: () => void
  onCreateFamily: (values: CreateFamilyValues) => Promise<void>
  onOpenCreate: () => void
  onSelectSpace: (spaceId: string) => void
  spaces: SpaceSwitcherItem[]
}

export function SpacesPage({
  activeSpaceId,
  creatingFamily,
  onCancelCreate,
  onCreateFamily,
  onOpenCreate,
  onSelectSpace,
  spaces,
}: SpacesPageProps) {
  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="border-b border-border pb-8">
        <p className="text-sm font-medium text-accent">Vaše společné místo</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Rodinné prostory
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-muted">
          Přepínejte mezi svým deníkem a místy, která tvoříte společně.
        </p>
      </header>
      <section className="py-8 sm:py-10">
        <h2 className="text-xl font-semibold">Aktivní prostor</h2>
        <div className="mt-5">
          <SpaceSwitcher
            activeSpaceId={activeSpaceId}
            onCreateFamily={onOpenCreate}
            onSelect={onSelectSpace}
            spaces={spaces}
          />
        </div>
      </section>
      {creatingFamily ? (
        <section className="rounded-md bg-surface p-5 shadow-soft sm:p-8">
          <h2 className="text-2xl font-semibold">Nový rodinný prostor</h2>
          <p className="mt-2 mb-7 leading-7 text-muted">
            Vytvořte společný domov pro cesty, vzpomínky a praktické tipy.
          </p>
          <CreateFamilyForm
            onCancel={onCancelCreate}
            onCreate={onCreateFamily}
          />
        </section>
      ) : null}
    </main>
  )
}
