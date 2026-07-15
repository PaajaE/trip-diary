import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { colors, spacing } from '@/foundation/theme'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'

export default function SignInScreen() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSignIn() {
    if (!isSupabaseConfigured()) {
      setError(t('mobile.supabaseNotConfigured'))
      return
    }

    setIsSubmitting(true)
    setError(null)

    const { error: signInError } =
      await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      })

    setIsSubmitting(false)

    if (signInError !== null) {
      setError(signInError.message)
      return
    }

    router.replace('/')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>{t('auth.signIn.description')}</Text>

      <TextInput
        accessibilityLabel={t('auth.email')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder={t('auth.email')}
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        accessibilityLabel={t('auth.password')}
        autoCapitalize="none"
        autoComplete="password"
        placeholder={t('auth.password')}
        secureTextEntry
        style={styles.input}
        value={password}
        onChangeText={setPassword}
      />

      {error !== null ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityLabel={t('auth.signIn.action')}
        accessibilityRole="button"
        disabled={isSubmitting}
        style={[styles.button, isSubmitting ? styles.buttonDisabled : null]}
        onPress={() => void handleSignIn()}
      >
        {isSubmitting ? (
          <ActivityIndicator accessibilityLabel={t('auth.submitting')} color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>{t('auth.signIn.action')}</Text>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    marginTop: spacing.xs,
    minHeight: 48,
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  container: {
    backgroundColor: colors.background,
    flex: 1,
    padding: spacing.lg,
  },
  error: {
    color: colors.error,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: spacing.sm,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
})
