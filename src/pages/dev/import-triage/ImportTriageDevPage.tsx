import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { createMemoryTriageItemStore } from '@/entities/media/api/triage-items.store'
import { ImportFlow } from '@/features/media-import/ui/flow/ImportFlow'
import { DEMO_JOURNEY, DEMO_OWNER } from '@/pages/dev/import-triage/demo-data'
import { createDemoTriageSource } from '@/pages/dev/import-triage/demo-source'
import { createFakeQueue } from '@/pages/dev/import-triage/fake-queue'
import { ViewerHarness } from '@/pages/dev/import-triage/ViewerHarness'
import { buildScenario } from '@/pages/dev/import-triage/scenarios'

const SAFE_AREAS = {
  '--flow-safe-bottom': '34px',
  '--flow-safe-top': '47px',
} as CSSProperties

/**
 * Dev-only harness: renders the import flow over a fake library, a fixed fake
 * upload queue and an in-memory store. `?s=<screen>` picks the scenario (the
 * anchors of docs/design/import-triage), `?theme=dark|light` the theme.
 * Not product UI; never routed in production builds.
 */
export function ImportTriageDevPage() {
  const params = new URLSearchParams(window.location.search)
  const name = params.get('s') ?? 'a-select'
  const theme = params.get('theme')
  useEffect(() => {
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])
  if (name === 'v-viewer' || name === 'v-details') {
    return <ViewerHarness expanded={name === 'v-details'} />
  }
  return <FlowHarness name={name} theme={params.get('theme')} />
}

function FlowHarness({ name, theme }: { name: string; theme: string | null }) {
  const [scenario] = useState(() => buildScenario(name))
  const [store] = useState(() => createMemoryTriageItemStore(scenario.items))
  const [queue] = useState(() => createFakeQueue(scenario.snapshot))
  const [source] = useState(() =>
    createDemoTriageSource({
      access: scenario.access,
      extraCloud: scenario.cloud,
      ...(scenario.hold === undefined ? {} : { hold: scenario.hold }),
      ...(scenario.listFails === undefined
        ? {}
        : { listFails: scenario.listFails }),
      total: scenario.total,
    }),
  )
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot)
  useEffect(() => {
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])
  return (
    <div style={SAFE_AREAS}>
      <ImportFlow
        defaultRange={['2026-08-03', '2026-08-11']}
        initial={scenario.initial}
        journeyId={DEMO_JOURNEY}
        lastImportAt={scenario.lastImportAt}
        locale="cs"
        now={() => Date.parse('2026-11-10T10:00:00.000Z')}
        onClose={() => undefined}
        onSort={() => undefined}
        ownerId={DEMO_OWNER}
        queue={queue}
        snapshot={snapshot}
        source={source}
        starMedia={() => Promise.resolve()}
        store={store}
        timeZone="America/Edmonton"
        wifiOnly
      />
    </div>
  )
}
