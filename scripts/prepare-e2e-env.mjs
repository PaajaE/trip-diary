import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const status = JSON.parse(
  execSync('supabase status --output json', { encoding: 'utf8' }),
)

writeFileSync(
  '.env.local',
  `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`,
)
