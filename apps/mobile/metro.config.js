const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const mobileNodeModules = path.resolve(projectRoot, 'node_modules')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  mobileNodeModules,
  path.resolve(workspaceRoot, 'node_modules'),
]

const forcedModulePaths = {
  react: path.join(mobileNodeModules, 'react', 'index.js'),
  'react/jsx-runtime': path.join(mobileNodeModules, 'react', 'jsx-runtime.js'),
  'react/jsx-dev-runtime': path.join(
    mobileNodeModules,
    'react',
    'jsx-dev-runtime.js',
  ),
}

const tripDiaryAliases = {
  '@trip-diary/config': path.join(
    workspaceRoot,
    'packages/config/src/index.ts',
  ),
  '@trip-diary/core/entry': path.join(
    workspaceRoot,
    'packages/core/src/entry.ts',
  ),
  '@trip-diary/core/journey': path.join(
    workspaceRoot,
    'packages/core/src/journey.ts',
  ),
  '@trip-diary/i18n': path.join(workspaceRoot, 'packages/i18n/src/index.ts'),
  '@trip-diary/maps': path.join(workspaceRoot, 'packages/maps/src/index.ts'),
  '@trip-diary/utils': path.join(workspaceRoot, 'packages/utils/src/index.ts'),
}

config.resolver.extraNodeModules = {
  'react-native': path.join(mobileNodeModules, 'react-native'),
  react: path.join(mobileNodeModules, 'react'),
  ...Object.fromEntries(
    Object.entries(tripDiaryAliases).map(([name, filePath]) => [
      name,
      path.dirname(filePath),
    ]),
  ),
}

const defaultResolveRequest = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const forcedPath = forcedModulePaths[moduleName]
  if (forcedPath !== undefined) {
    return { filePath: forcedPath, type: 'sourceFile' }
  }

  const tripDiaryPath = tripDiaryAliases[moduleName]
  if (tripDiaryPath !== undefined) {
    return { filePath: tripDiaryPath, type: 'sourceFile' }
  }

  if (defaultResolveRequest !== undefined && defaultResolveRequest !== null) {
    return defaultResolveRequest(context, moduleName, platform)
  }

  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
