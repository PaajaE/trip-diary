import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { journeyQueryKeys } from '@/features/journeys'
import { useJourneyFullDetailQuery } from '@/features/journeys/use-journey-full-detail-query'
import { MomentEditorForm } from '@/features/journeys/ui/MomentEditorForm'
import { useAuth } from '@/platform/auth/AuthProvider'
import { colors } from '@/foundation/theme'

export default function NewMomentScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { id, stageId } = useLocalSearchParams<{
    id: string
    stageId?: string
  }>()
  const { session } = useAuth()
  const { t } = useTranslation()
  const { data, isLoading } = useJourneyFullDetailQuery(id)

  if (session?.user.id === undefined) {
    return null
  }

  if (isLoading || data === undefined) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: t('journey.memoryTitle') }} />
      <MomentEditorForm
        creatorId={session.user.id}
        initialStageId={typeof stageId === 'string' ? stageId : null}
        journeyId={id}
        mode="create"
        onCancel={() => {
          router.back()
        }}
        onSaved={() => {
          void queryClient.invalidateQueries({
            queryKey: journeyQueryKeys.content(id),
          })
          void queryClient.invalidateQueries({
            queryKey: journeyQueryKeys.stops(session.user.id, id),
          })
          router.back()
        }}
        spaceId={data.detail.spaceId}
        stages={data.detail.stages}
        stops={data.detail.stops}
        userId={session.user.id}
      />
    </>
  )
}
