/**
 * Monorepo fix: the default expo/react-native.config.js resolves project root
 * to the repository root, so Android autolinking falls back to the legacy
 * `expo.core.ExpoModulesPackage` import. Trip Diary's native project lives
 * under apps/mobile/android.
 */
module.exports = {
  dependency: {
    platforms: {
      android: {
        packageImportPath: 'import expo.modules.ExpoModulesPackage;',
      },
    },
  },
}
