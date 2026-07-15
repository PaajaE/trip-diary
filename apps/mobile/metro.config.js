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

config.resolver.extraNodeModules = {
  'react-native': path.join(mobileNodeModules, 'react-native'),
  react: path.join(mobileNodeModules, 'react'),
}

const defaultResolveRequest = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const forcedPath = forcedModulePaths[moduleName]
  if (forcedPath !== undefined) {
    return { filePath: forcedPath, type: 'sourceFile' }
  }

  if (defaultResolveRequest !== undefined && defaultResolveRequest !== null) {
    return defaultResolveRequest(context, moduleName, platform)
  }

  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
