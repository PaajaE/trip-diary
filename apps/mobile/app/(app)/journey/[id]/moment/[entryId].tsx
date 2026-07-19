import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { fetchJourneyEntry } from '@/features/entries/api/entries.repository'
import { journeyQueryKeys } from '@/features/journeys'
import { invalidateJourneyPhotoQueries } from '@/features/journeys/lib/journey-cache-mutations'
import { useJourneyFullDetailQuery } from '@/features/journeys/use-journey-full-detail-query'
import { MomentEditorForm } from '@/features/journeys/ui/MomentEditorForm'
import { useAuth } from '@/platform/auth/AuthProvider'
import { colors } from '@/foundation/theme'

export default function EditMomentScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { entryId, id } = useLocalSearchParams<{
    entryId: string
    id: string
  }>()
  const { session } = useAuth()
  const { t } = useTranslation()
  const journeyQuery = useJourneyFullDetailQuery(id)
  const entryQuery = useQuery({
    enabled: entryId.length > 0,
    queryFn: () => fetchJourneyEntry(entryId),
    queryKey: journeyQueryKeys.entry(entryId),
  })

  if (session?.user.id === undefined) {
    return null
  }

  if (
    journeyQuery.isLoading ||
    journeyQuery.data === undefined ||
    entryQuery.isLoading
  ) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  if (entryQuery.data === null || entryQuery.data === undefined) {
    router.back()
    return null
  }

  return (
    <>
      <Stack.Screen options={{ title: t('entry.editTitle') }} />
      <MomentEditorForm
        creatorId={session.user.id}
        entry={entryQuery.data}
        journeyId={id}
        mode="edit"
        onCancel={() => {
          router.back()
        }}
        onSaved={() => {
          invalidateJourneyPhotoQueries(queryClient, id, session.user.id)
          void queryClient.invalidateQueries({
            queryKey: journeyQueryKeys.entry(entryId),
          })
          void queryClient.invalidateQueries({
            queryKey: journeyQueryKeys.stops(session.user.id, id),
          })
          router.back()
        }}
        spaceId={journeyQuery.data.detail.spaceId}
        stages={journeyQuery.data.detail.stages}
        stops={journeyQuery.data.detail.stops}
        userId={session.user.id}
      />
    </>
  )
}
