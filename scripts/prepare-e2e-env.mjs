import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

function getSupabaseStatus() {
  if (existsSync('/tmp/supabase-status.json')) {
    return JSON.parse(readFileSync('/tmp/supabase-status.json', 'utf8'))
  }

  try {
    return JSON.parse(
      execSync('supabase status --output json', { encoding: 'utf8' }),
    )
  } catch {
    if (existsSync('.env.local')) {
      process.exit(0)
    }
    throw new Error('Supabase is not running and .env.local is missing')
  }
}

const status = getSupabaseStatus()

writeFileSync(
  '.env.local',
  `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`,
)
