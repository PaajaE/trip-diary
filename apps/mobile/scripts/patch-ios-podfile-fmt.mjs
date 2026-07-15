import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mobileRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const podfilePath = path.join(mobileRoot, 'ios/Podfile')

const marker = "next unless target.name == 'fmt'"
const patch = `
    # Xcode 26: Apple Clang rejects fmt 11.0.2 consteval format strings (RN 0.76 bundle).
    # Compile only the fmt pod as C++17 so FMT_USE_CONSTEVAL is not used.
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'

      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
`

if (!fs.existsSync(podfilePath)) {
  console.log('[patch-ios-podfile-fmt] ios/Podfile not found; skipping')
  process.exit(0)
}

const podfile = fs.readFileSync(podfilePath, 'utf8')
if (podfile.includes(marker)) {
  console.log('[patch-ios-podfile-fmt] Podfile patch already present')
  process.exit(0)
}

const anchor = `    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => podfile_properties['apple.ccacheEnabled'] == 'true',
    )
`

if (!podfile.includes(anchor)) {
  console.warn('[patch-ios-podfile-fmt] Unexpected Podfile shape; skipping')
  process.exit(0)
}

const patched = podfile.replace(anchor, `${anchor}${patch}`)
fs.writeFileSync(podfilePath, patched)
console.log('[patch-ios-podfile-fmt] Patched ios/Podfile')
