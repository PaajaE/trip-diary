import { Stack } from 'expo-router'
import { type ComponentType } from 'react'
import { appStackScreenOptions } from '@/foundation/navigation/screen-options'

const JourneyStack = Stack as ComponentType<Record<string, unknown>>

export default function JourneyLayout() {
  return (
    <JourneyStack screenOptions={appStackScreenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="manage" />
      <Stack.Screen name="moment/new" />
      <Stack.Screen name="moment/[entryId]" />
      <Stack.Screen name="stage/[stageId]" />
    </JourneyStack>
  )
}
