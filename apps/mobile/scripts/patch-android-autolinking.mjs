import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mobileRoot = path.dirname(fileURLToPath(import.meta.url))
const buildGradlePath = path.join(mobileRoot, 'android/app/build.gradle')

const gradleHook = `
// Monorepo workaround: RN autolinking emits legacy expo.core import path.
tasks.named("generateAutolinkingPackageList").configure {
    doLast {
        def packageList = file("build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java")
        if (packageList.exists()) {
            def text = packageList.getText("UTF-8")
            def fixed = text.replace(
                "import expo.core.ExpoModulesPackage;",
                "import expo.modules.ExpoModulesPackage;"
            )
            if (!text.equals(fixed)) {
                packageList.write(fixed, "UTF-8")
            }
        }
    }
}
`

if (!fs.existsSync(buildGradlePath)) {
  console.log(
    '[patch-android-autolinking] android/app/build.gradle not found; skipping',
  )
  process.exit(0)
}

const buildGradle = fs.readFileSync(buildGradlePath, 'utf8')
if (buildGradle.includes('expo.core.ExpoModulesPackage')) {
  console.log('[patch-android-autolinking] Gradle hook already present')
  process.exit(0)
}

fs.writeFileSync(buildGradlePath, `${buildGradle.trimEnd()}\n${gradleHook}`)
console.log('[patch-android-autolinking] Patched android/app/build.gradle')
