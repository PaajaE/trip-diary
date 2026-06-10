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
  entry: {
    body: 'Story',
    createTitle: 'Add a memory',
    error: 'The memory could not be loaded.',
    loading: 'Loading…',
    notFound: 'This memory does not exist.',
    photos: 'Photos',
    photosSelected: '{{count}} photos selected',
    publish: 'Save and publish',
    signInRequired: 'Sign in before publishing a memory.',
    syncNow: 'Sync now',
    title: 'Title',
    type: {
      note: 'Note',
      place: 'Place',
      story: 'Story',
      tip: 'Tip',
    },
    sync: {
      failed: 'Saved on this device · synchronization needs attention',
      local: 'Saved on this device',
      pending: 'Saved on this device · waiting to synchronize',
      synced: 'Synchronized',
      syncing: 'Synchronizing…',
    },
  },
  journey: {
    add: 'Add',
    addContent: 'Build the journey',
    addError: 'The content could not be added. Please try again.',
    addGuide: 'Practical section',
    addStage: 'New stage',
    addStop: 'New place',
    create: 'Create journey',
    createTitle: 'Plan a journey',
    emptyRoute: 'You can add the first stage or place later.',
    endsAt: 'End',
    error: 'The journey could not be loaded.',
    guide: 'Practical guide',
    guideBody: 'Notes',
    itemTitle: 'Title',
    loading: 'Loading journey…',
    notFound: 'This journey does not exist.',
    route: 'Journey route',
    signInRequired: 'Sign in before creating a journey.',
    startsAt: 'Start',
    stage: 'Stage',
    summary: 'Short description',
    title: 'Journey name',
    status: {
      active: 'On the road',
      completed: 'Completed journey',
      planning: 'Planned journey',
    },
  },
} as const

type TranslationShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : TranslationShape<T[Key]>
}

export type TranslationResources = TranslationShape<typeof en>
