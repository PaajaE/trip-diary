import { ESLint, type Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

interface RestrictedImportPath {
  importNames?: string[]
  message?: string
  name?: string
}

function asRulesRecord(rules: unknown): Linter.RulesRecord | undefined {
  return rules as Linter.RulesRecord | undefined
}

function expectRuleEnabled(
  rules: Linter.RulesRecord | undefined,
  ruleName: string,
): void {
  const severity = rules?.[ruleName]
  const level = Array.isArray(severity) ? severity[0] : severity
  expect(level === 'error' || level === 2).toBe(true)
}

function restrictedImportPaths(
  rules: Linter.RulesRecord | undefined,
): RestrictedImportPath[] {
  const config = rules?.['no-restricted-imports']
  if (!Array.isArray(config)) {
    return []
  }

  const options = config[1]
  if (
    typeof options !== 'object' ||
    options === null ||
    !('paths' in options)
  ) {
    return []
  }

  const paths = options.paths
  return Array.isArray(paths) ? (paths as RestrictedImportPath[]) : []
}

describe('eslint workspace coverage', () => {
  it('lints shared package source', async () => {
    const eslint = new ESLint()
    const results = await eslint.lintFiles(['packages/core/src/entry.ts'])

    expect(results).toHaveLength(1)
    expect(results[0]?.errorCount).toBe(0)
  })

  it('restricts deprecated web translation repository imports', async () => {
    const eslint = new ESLint()
    const config = await eslint.calculateConfigForFile(
      'src/features/entries/ui/EntryTranslationPanel.tsx',
    )

    const rules = asRulesRecord(config.rules)
    expectRuleEnabled(rules, 'no-restricted-imports')
    expect(
      restrictedImportPaths(rules).some(
        (entry) =>
          entry.name === '@/features/entries/api/translation.repository',
      ),
    ).toBe(true)
  })

  it('ignores generated Supabase types', async () => {
    const eslint = new ESLint()
    const isIgnored = await eslint.isPathIgnored(
      'src/shared/api/database.types.ts',
    )

    expect(isIgnored).toBe(true)
  })
})
