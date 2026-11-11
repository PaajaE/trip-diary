import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dexieTriageItemStore } from '@/entities/media/api/triage-items.store'
import { updateMediaMeta } from '@/entities/media/api/media-library.repository'
import { dexieUploadJobStore } from '@/entities/media/api/upload-jobs.store'
import { useSession } from '@/features/auth/session/use-session'
import { createFilesTriageSource } from '@/features/media-import/api/files-triage-source'
import { createPhotoKitTriageSource } from '@/features/media-import/api/photokit-triage-source'
import { useImportQueue } from '@/features/media-import/api/use-import-queue'
import { isWifiOnlyUpload } from '@/features/media-import/api/upload-network'
import { ImportFlow } from '@/features/media-import/ui/flow/ImportFlow'
import { useAutoOrganizeAfterUpload } from '@/features/journey-organize/api/use-auto-organize'
import { isMediaLibraryAvailable } from '@/shared/lib/media-library'

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Import flow "Vybrat → Probrat → Nahrát" of one journey. */
export function ImportPage({ journeyId }: { journeyId: string }) {
  const { user } = useSession()
  if (user === null) return null
  return <ImportRoute journeyId={journeyId} ownerId={user.id} />
}

function ImportRoute({
  journeyId,
  ownerId,
}: {
  journeyId: string
  ownerId: string
}) {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const native = isMediaLibraryAvailable()
  const source = useMemo(
    () => (native ? createPhotoKitTriageSource() : createFilesTriageSource()),
    [native],
  )
  const { queue, setSource, snapshot } = useImportQueue(journeyId, ownerId)
  // The queue worker opens originals through this source (also after a restart).
  useEffect(() => {
    setSource(source.mediaSource)
  }, [setSource, source])
  // Every finished batch is organised automatically (ZS-7).
  useAutoOrganizeAfterUpload(journeyId, snapshot)

  const [lastImportAt, setLastImportAt] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void dexieUploadJobStore.getCursor(journeyId, source.kind).then(
      (cursor) => {
        if (!cancelled) setLastImportAt(cursor?.lastCapturedAt ?? null)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [journeyId, source.kind])

  return (
    <ImportFlow
      journeyId={journeyId}
      lastImportAt={lastImportAt}
      locale={i18n.language}
      onClose={() => {
        void navigate({ params: { journeyId }, to: '/j/$journeyId/workspace' })
      }}
      onSort={() => {
        void navigate({ params: { journeyId }, to: '/j/$journeyId/batch' })
      }}
      ownerId={ownerId}
      queue={queue}
      snapshot={snapshot}
      source={source}
      starMedia={async (mediaId) => {
        await updateMediaMeta(mediaId, { starred: true })
      }}
      store={dexieTriageItemStore}
      timeZone={deviceTimeZone()}
      wifiOnly={isWifiOnlyUpload()}
    />
  )
}
