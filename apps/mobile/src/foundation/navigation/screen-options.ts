import { colors } from '@/foundation/theme'

export const appStackScreenOptions = {
  headerBackTitleVisible: false,
  headerShadowVisible: false,
  headerStyle: {
    backgroundColor: colors.background,
  },
  headerTintColor: colors.primary,
  headerTitleStyle: {
    fontWeight: '600' as const,
  },
}
