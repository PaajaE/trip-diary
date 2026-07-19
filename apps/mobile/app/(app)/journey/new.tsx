import { Stack, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { journeyQueryKeys } from '@/features/journeys'
import {
  applyCreatedJourneyToQueryCache,
  upsertCreatedJourneyInListCache,
} from '@/features/journeys/lib/journey-cache-mutations'
import { CreateJourneyForm } from '@/features/journeys/ui/CreateJourneyForm'
import { colors, spacing } from '@/foundation/theme'
import { useAuth } from '@/platform/auth/AuthProvider'
import { cacheJourney } from '@/platform/storage/sqlite'

export default function CreateJourneyScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const { t } = useTranslation()
  const userId = session?.user.id

  return (
    <>
      <Stack.Screen options={{ title: t('journey.createTitle') }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.description}>{t('dashboard.description')}</Text>
        {userId === undefined ? (
          <View style={styles.errorPanel}>
            <Text style={styles.error}>{t('journey.createError')}</Text>
          </View>
        ) : (
          <CreateJourneyForm
            creatorId={userId}
            onCreated={async (journeyId, meta) => {
              const listItem = {
                endsAt: meta.endsAt,
                id: journeyId,
                startsAt: meta.startsAt,
                status: 'planning' as const,
                summary: meta.summary,
                title: meta.title,
                updatedAt: new Date().toISOString(),
              }
              await upsertCreatedJourneyInListCache({
                journey: listItem,
                spaceId: meta.spaceId,
                userId,
              })
              await cacheJourney({
                endsAt: meta.endsAt,
                id: journeyId,
                startsAt: meta.startsAt,
                status: 'planning',
                summary: meta.summary,
                title: meta.title,
              })
              applyCreatedJourneyToQueryCache({
                journey: listItem,
                queryClient,
                spaceId: meta.spaceId,
                userId,
              })
              await queryClient.invalidateQueries({
                queryKey: journeyQueryKeys.list(userId, meta.spaceId),
              })
              router.replace(`/journey/${journeyId}`)
            }}
          />
        )}
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.lg,
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  error: {
    color: colors.error,
    fontSize: 15,
    lineHeight: 22,
  },
  errorPanel: {
    backgroundColor: '#fde8e8',
    borderColor: '#f5b7b7',
    borderRadius: 10,
    borderWidth: 1,
    padding: spacing.md,
  },
})
