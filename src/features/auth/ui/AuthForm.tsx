import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { signIn, signUp } from '@/features/auth/api/auth.service'
import {
  signInSchema,
  signUpSchema,
  type SignInInput,
  type SignUpInput,
} from '@/features/auth/model/auth.schemas'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

type AuthFormProps =
  | { mode: 'signIn'; onSuccess: () => void }
  | { mode: 'signUp'; onSuccess: () => void }

export function AuthForm({ mode, onSuccess }: AuthFormProps) {
  const { t } = useTranslation()
  const [formError, setFormError] = useState<string | null>(null)
  const isSignUp = mode === 'signUp'
  const validationMessage = {
    confirmPassword: t('auth.validation.passwordsDoNotMatch'),
    email: t('auth.validation.email'),
    password: t('auth.validation.password'),
    username: t('auth.validation.username'),
  } as const
  const form = useForm<SignInInput | SignUpInput>({
    resolver: zodResolver(isSignUp ? signUpSchema : signInSchema),
    defaultValues: {
      email: '',
      password: '',
      ...(isSignUp ? { confirmPassword: '', username: '' } : {}),
    },
  })

  async function handleSubmit(values: SignInInput | SignUpInput) {
    setFormError(null)

    try {
      if (isSignUp) {
        await signUp(signUpSchema.parse(values))
      } else {
        await signIn(signInSchema.parse(values))
      }
      onSuccess()
    } catch {
      setFormError(t('auth.genericError'))
    }
  }

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => void form.handleSubmit(handleSubmit)(event)}
    >
      <Input
        autoComplete="email"
        error={
          form.formState.errors.email === undefined
            ? undefined
            : validationMessage.email
        }
        label={t('auth.email')}
        type="email"
        {...form.register('email')}
      />
      {isSignUp ? (
        <Input
          autoCapitalize="none"
          autoComplete="username"
          error={
            'username' in form.formState.errors
              ? validationMessage.username
              : undefined
          }
          label={t('auth.username')}
          {...form.register('username')}
        />
      ) : null}
      <Input
        autoComplete={isSignUp ? 'new-password' : 'current-password'}
        error={
          form.formState.errors.password === undefined
            ? undefined
            : validationMessage.password
        }
        label={t('auth.password')}
        type="password"
        {...form.register('password')}
      />
      {isSignUp ? (
        <Input
          autoComplete="new-password"
          error={
            'confirmPassword' in form.formState.errors
              ? validationMessage.confirmPassword
              : undefined
          }
          label={t('auth.confirmPassword')}
          type="password"
          {...form.register('confirmPassword')}
        />
      ) : null}
      {formError === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      )}
      <Button
        className="w-full"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {form.formState.isSubmitting
          ? t('auth.submitting')
          : t(`auth.${mode}.action`)}
      </Button>
    </form>
  )
}
