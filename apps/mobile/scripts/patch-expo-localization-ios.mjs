import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mobileRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const localizationModulePath = path.join(
  mobileRoot,
  'node_modules/expo-localization/ios/LocalizationModule.swift',
)

const marker = 'case .bangla:'
const patch = `    case .bangla:
      return "beng"
    case .gujarati:
      return "gujr"
    case .kannada:
      return "knda"
    case .malayalam:
      return "mlym"
    case .marathi:
      return "mr"
    case .odia:
      return "orya"
    case .tamil:
      return "taml"
    case .telugu:
      return "telu"
    case .vikram:
      return "vikram"
    case .dangi:
      return "dangi"
    case .vietnamese:
      return "viet"
    @unknown default:
      log.error("Unhandled \`Calendar.Identifier\` value: \\(calendar.identifier), returning \`iso8601\` as fallback. Add the missing case as soon as possible.")
      return "iso8601"`

if (!fs.existsSync(localizationModulePath)) {
  console.log(
    '[patch-expo-localization-ios] LocalizationModule.swift not found; skipping',
  )
  process.exit(0)
}

const source = fs.readFileSync(localizationModulePath, 'utf8')
if (source.includes(marker)) {
  console.log('[patch-expo-localization-ios] Patch already applied')
  process.exit(0)
}

const searchPattern = `    case .iso8601:
      return "iso8601"
    }`

if (!source.includes(searchPattern)) {
  console.warn(
    '[patch-expo-localization-ios] Unexpected LocalizationModule.swift shape; skipping',
  )
  process.exit(0)
}

const patched = source.replace(
  searchPattern,
  `    case .iso8601:
      return "iso8601"
${patch}
    }`,
)

fs.writeFileSync(localizationModulePath, patched)
console.log('[patch-expo-localization-ios] Patched LocalizationModule.swift')
