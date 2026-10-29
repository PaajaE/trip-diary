// Scorecard of the photo-organising automation (packages/core/automation).
//
//   pnpm algo:score              synthetic sets only
//   GOLDEN_DIR=~/golden pnpm algo:score
//                                also every *.json there (hand-labelled real
//                                sets; keep them out of the repository)
//   pnpm algo:score --strict     exit 1 when a target is missed
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  formatScorecard,
  goldenSetSchema,
  meetsTargets,
  scoreGoldenSet,
  syntheticGoldenSets,
} from '../packages/core/src/automation/scorecard/index.ts'

const sets = syntheticGoldenSets()
const dir = process.env.GOLDEN_DIR
if (dir) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const parsed = goldenSetSchema.safeParse(
      JSON.parse(readFileSync(join(dir, file), 'utf8')),
    )
    if (!parsed.success) {
      console.error(`${file}: neplatná zlatá sada\n${parsed.error.message}`)
      process.exit(2)
    }
    sets.push(parsed.data)
  }
}

const scores = sets.map(scoreGoldenSet)
console.log(formatScorecard(scores))
const ok = meetsTargets(scores)
console.log(ok ? '\nVšechny cíle splněny.' : '\nNěkteré cíle nesplněny (MISS).')
if (process.argv.includes('--strict') && !ok) process.exit(1)
