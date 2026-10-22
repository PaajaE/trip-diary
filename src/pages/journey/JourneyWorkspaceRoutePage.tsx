import {
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from '@tanstack/react-router'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'
import { WorkspaceToolbar } from '@/features/journey-workspace/ui/WorkspaceToolbar'
import { JourneyOwnerFrame } from '@/pages/journey/JourneyOwnerFrame'

export function JourneyWorkspaceRoutePage() {
  const { t } = useTranslation()
  const { journeyId } = useParams({ from: '/j/$journeyId/workspace' })
  const { map } = useSearch({ from: '/j/$journeyId/workspace' })
  const navigate = useNavigate()
  const router = useRouter()
  // Opened from inside the page: closing steps back, so Back and Esc agree.
  const openedHere = useRef(false)
  const setFull = (full: boolean) => {
    if (full === (map === 'full')) return
    if (!full && openedHere.current) {
      openedHere.current = false
      router.history.back()
      return
    }
    openedHere.current = full
    void navigate({
      params: { journeyId },
      replace: !full,
      resetScroll: false,
      search: full ? { map: 'full' } : {},
      to: '/j/$journeyId/workspace',
    })
  }
  return (
    <JourneyOwnerFrame
      actions={<WorkspaceToolbar journeyId={journeyId} />}
      current="workspace"
      description={t('workspace.subtitle')}
      descriptionClassName="hidden sm:block"
      journeyId={journeyId}
      width="wide"
    >
      <JourneyWorkspace
        fullMap={map === 'full'}
        journeyId={journeyId}
        onFullMapChange={setFull}
      />
    </JourneyOwnerFrame>
  )
}
