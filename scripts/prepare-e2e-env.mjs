import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

function getSupabaseStatus() {
  if (existsSync('/tmp/supabase-status.json')) {
    return JSON.parse(readFileSync('/tmp/supabase-status.json', 'utf8'))
  }

  return JSON.parse(
    execSync('supabase status --output json', { encoding: 'utf8' }),
  )
}

const status = getSupabaseStatus()

writeFileSync(
  '.env.local',
  `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`,
)
