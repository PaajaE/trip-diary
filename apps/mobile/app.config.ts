import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'Trip Diary',
  slug: 'trip-diary',
  scheme: 'cz.tripdiary.app',
  version: '0.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: false,
  ios: {
    bundleIdentifier: 'cz.tripdiary.app',
    supportsTablet: true,
  },
  android: {
    package: 'cz.tripdiary.app',
  },
  plugins: [
    'expo-router',
    'expo-localization',
    'expo-sqlite',
    'expo-video',
    '@maplibre/maplibre-react-native',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Trip Diary to access your photos.',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Allow Trip Diary to use your location for photo metadata.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
}

export default config
