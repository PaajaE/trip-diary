export const en = {
  brand: 'Trip Diary',
  home: {
    eyebrow: 'Your journeys, clearly remembered',
    title: 'A calm place for every road you take.',
    description:
      'Capture photos and stories in seconds. Organize them into journeys whenever it suits you.',
    primaryAction: 'Add a memory',
    secondaryAction: 'Explore journeys',
    signIn: 'Sign in',
    status: 'Offline-ready foundation',
  },
  auth: {
    email: 'Email',
    username: 'Username',
    password: 'Password',
    confirmPassword: 'Confirm password',
    genericError:
      'Something went wrong. Please check your details and try again.',
    submitting: 'Please wait…',
    validation: {
      email: 'Enter a valid email address.',
      password: 'Use 8–72 characters.',
      passwordsDoNotMatch: 'Passwords do not match.',
      username: 'Use 3–30 lowercase letters, numbers, or underscores.',
    },
    signIn: {
      title: 'Welcome back',
      description: 'Continue where your journey left off.',
      action: 'Sign in',
      alternative: 'New to Trip Diary?',
    },
    signUp: {
      title: 'Create your diary',
      description: 'A quiet home for all the places you will remember.',
      action: 'Create account',
      alternative: 'Already have an account?',
    },
  },
  profile: {
    loading: 'Loading profile…',
    error: 'The profile could not be loaded.',
    notFound: 'This profile does not exist.',
  },
} as const

type TranslationShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : TranslationShape<T[Key]>
}

export type TranslationResources = TranslationShape<typeof en>
