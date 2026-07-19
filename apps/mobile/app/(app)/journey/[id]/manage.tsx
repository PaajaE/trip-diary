import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { journeyQueryKeys } from '@/features/journeys'
import { applyDeletedJourneyLocally } from '@/features/journeys/lib/journey-cache-mutations'
import { useJourneyFullDetailQuery } from '@/features/journeys/use-journey-full-detail-query'
import { JourneyManagePanel } from '@/features/journeys/ui/JourneyManagePanel'
import { useAuth } from '@/platform/auth/AuthProvider'
import { colors } from '@/foundation/theme'

export default function JourneyManageScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { id: rawId } = useLocalSearchParams<{ id: string }>()
  const id = typeof rawId === 'string' ? rawId : rawId[0]
  const { session } = useAuth()
  const { t } = useTranslation()
  const { data, isLoading } = useJourneyFullDetailQuery(id)
  const userId = session?.user.id

  if (isLoading || data === undefined) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: t('journey.manageTrip') }} />
      <JourneyManagePanel
        journey={data.detail}
        onChanged={() => {
          void queryClient.invalidateQueries({
            queryKey: journeyQueryKeys.content(id),
          })
          void queryClient.invalidateQueries({
            queryKey: journeyQueryKeys.detail(id),
          })
          void queryClient.invalidateQueries({
            queryKey: journeyQueryKeys.stops(userId ?? '', id),
          })
          if (userId !== undefined) {
            void queryClient.invalidateQueries({
              queryKey: journeyQueryKeys.list(userId, data.detail.spaceId),
            })
          }
        }}
        onDeleted={async () => {
          await applyDeletedJourneyLocally({
            journeyId: id,
            queryClient,
            spaceId: data.detail.spaceId,
            userId,
          })
          router.replace('/')
        }}
      />
    </>
  )
}
