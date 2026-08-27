import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

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

function ensureFocalPointMigration(status) {
  const dbUrl = status.DB_URL
  if (typeof dbUrl !== 'string' || dbUrl.length === 0) {
    return
  }

  try {
    const applied = execSync(
      `psql "${dbUrl}" -tAc "select 1 from information_schema.columns where table_schema='public' and table_name='entry_photos' and column_name='focal_x' limit 1"`,
      { encoding: 'utf8' },
    ).trim()
    if (applied === '1') {
      return
    }
    execSync('supabase migration up', { stdio: 'inherit' })
  } catch {
    // Local Postgres may be unavailable before Supabase finishes starting.
  }
}

const status = getSupabaseStatus()
ensureFocalPointMigration(status)

writeFileSync(
  '.env.local',
  `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`,
)
