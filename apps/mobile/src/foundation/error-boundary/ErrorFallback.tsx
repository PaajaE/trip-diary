import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/foundation/theme'

export interface ErrorFallbackProps {
  error: Error
  onRetry?: () => void
  retryLabel?: string
  title?: string
}

export function ErrorFallback({
  error,
  onRetry,
  retryLabel = 'Try again',
  title = 'Something went wrong',
}: ErrorFallbackProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{error.message}</Text>
      {onRetry !== undefined ? (
        <Text accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          {retryLabel}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  message: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  retry: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
})
