// The Feature playground's experiment, apart from its page: the chain stops at the first step
// that doesn't succeed (later steps are never invoked, so they have no evidence), its words never
// quote data, and neither the language nor the playground can persist, fetch, log or evaluate code.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Data } from '../shared/features/definitions'
import { type Mapping, reviseMapping } from '../shared/features/mappings'
import type { Catalog } from '../shared/features/features'
import {
  A1, B1, CONSOLES, DEFINITIONS, INITIAL_DATA, INITIAL_MAPPING, PINS, RECORD_ID, WORKSPACE,
  describeOutcome, formatPath, mappingHints, outcomeIssues, parseRecordData, runExperiment,
} from '../app/dev/features/experiment'
import { playgroundAvailable } from '../app/dev/features/availability'

const catalog = (pin = 'a1', data: unknown = INITIAL_DATA, mappings: Mapping[] = [INITIAL_MAPPING]): Catalog => ({
  definitions: DEFINITIONS,
  records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: PINS.find((p) => p.key === pin)!.ref, data: data as Data }],
  mappings,
})
const run = (c: Catalog, consoleIndex = 0, mapping: { id: string; version: number } = INITIAL_MAPPING) =>
  runExperiment(c, { console: CONSOLES[consoleIndex]!.feature, mapping })
const outcomes = (steps: ReturnType<typeof run>) => steps.map((s) => s?.evidence.outcome.kind ?? 'not invoked')

let logged: ReturnType<typeof vi.spyOn>[] = []
beforeEach(() => { logged = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {})) })
afterEach(() => { for (const spy of logged) expect(spy).not.toHaveBeenCalled(); vi.restoreAllMocks() })

describe('Record A → Orbit.Console → Orbit.Transform → Orbit.Console', () => {
  it('shows the original, transforms it, and shows the result', () => {
    const steps = run(catalog())
    expect(outcomes(steps)).toEqual(['succeeded', 'succeeded', 'succeeded'])
    expect(steps[0]!.observations).toEqual([{ firstName: '  Ada  ', lastName: 'Lovelace' }])
    expect(steps[1]!.output).toEqual({ definition: { id: B1.id, version: 1 }, data: { fullName: 'Ada Lovelace' } })
    expect(steps[2]!.observations).toEqual([{ fullName: 'Ada Lovelace' }])
    expect(steps[2]!.output!.definition).toEqual({ id: B1.id, version: 1 })
  })

  it('runs again with a revised Mapping, and the evidence names the version that ran', () => {
    const v2 = reviseMapping(INITIAL_MAPPING, [{ name: 'fullName', source: { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [{ kind: 'property', name: 'lastName' }, { kind: 'call', fn: 'trim', args: [{ kind: 'property', name: 'firstName' }] }] }, { kind: 'literal', value: ', ' }] } }])
    const steps = run(catalog('a1', INITIAL_DATA, [INITIAL_MAPPING, v2]), 0, v2)
    expect(steps[2]!.observations).toEqual([{ fullName: 'Lovelace, Ada' }])
    expect(steps[1]!.evidence.mapping).toEqual({ id: INITIAL_MAPPING.id, version: 2 })
  })

  it('stops at a contract mismatch: Console accepts any Definition, Transform only A v1, and the last step is never invoked', () => {
    for (const pin of ['a2', 'copy']) {
      const data = pin === 'a2' ? { ...INITIAL_DATA, email: 'ada@example.com' } : INITIAL_DATA
      const steps = run(catalog(pin, data))
      expect(outcomes(steps)).toEqual(['succeeded', 'not_attempted', 'not invoked'])
      expect(steps[1]!.evidence.outcome).toMatchObject({ reason: 'contract_mismatch', expected: { id: A1.id, version: 1 } })
    }
  })

  it('finds nothing when Record A is pinned to another workspace’s Definition', () => {
    expect(outcomes(run(catalog('elsewhere')))).toEqual(['not_attempted', 'not invoked', 'not invoked'])
  })

  it('stops at invalid input, before any Feature runs', () => {
    const steps = run(catalog('a1', { firstName: 'Ada' }))
    expect(outcomes(steps)).toEqual(['not_attempted', 'not invoked', 'not invoked'])
    expect(steps[0]!.observations).toEqual([])
    expect(outcomeIssues(steps[0]!.evidence.outcome)).toEqual(['lastName is missing (it should be text).'])
  })

  it('never hands invalid output to the next Feature', () => {
    const bad = reviseMapping(INITIAL_MAPPING, [{ name: 'fullName', source: { kind: 'literal', value: 1815 } }])
    const steps = run(catalog('a1', INITIAL_DATA, [INITIAL_MAPPING, bad]), 0, bad)
    expect(outcomes(steps)).toEqual(['succeeded', 'failed', 'not invoked'])
    expect(outcomeIssues(steps[1]!.evidence.outcome)).toEqual(['fullName should be text, not a number.'])
  })

  it('holds against a Console that misbehaves: changing the value fails, handing on something else is stopped', () => {
    expect(outcomes(run(catalog(), 1))).toEqual(['failed', 'not invoked', 'not invoked'])
    const swapped = run(catalog(), 2)
    expect(outcomes(swapped)).toEqual(['failed', 'not invoked', 'not invoked'])
    expect(swapped[0]!.evidence.outcome).toEqual({ kind: 'failed', reason: 'pass_through_broken' })
  })

  it('leaves Record A exactly as it was', () => {
    const c = catalog()
    run(c); run(c, 1); run(c, 2)
    expect(c.records[0]!.data).toEqual(INITIAL_DATA)
    expect(c.records).toHaveLength(1)
  })
})

describe('Words in the playground', () => {
  it('describes outcomes and issues without quoting data', () => {
    const steps = [run(catalog('a1', { firstName: 'Ada', lastName: 7 })), run(catalog('a2', { ...INITIAL_DATA, email: 'ada@example.com' })), run(catalog(), 1)]
    for (const r of steps.flat().filter((s) => s !== null)) {
      const words = [describeOutcome(r.evidence.outcome), ...outcomeIssues(r.evidence.outcome)].join(' ')
      expect(words).not.toMatch(/Ada|Lovelace|ada@example\.com/)
    }
    expect(describeOutcome(steps[1]![1]!.evidence.outcome)).toBe('It reads Definition A · v1, but received Definition A · v2. Exact versions only, so the Feature didn’t run.')
  })

  it('locates problems inside nested sources', () => {
    expect(formatPath(['fullName', 'join', 0, 1, 'trim', 0])).toBe('fullName › join › argument 1 › item 2 › trim › argument 1')
    expect(formatPath([2])).toBe('property 3')
  })

  it('hints while editing: each property’s type, what Definition B expects, and what it still needs', () => {
    expect(mappingHints(INITIAL_MAPPING.properties, A1, B1)).toEqual({ rows: [{ type: 'string', expected: 'string', issues: [] }], missing: [] })
    const hints = mappingHints([{ name: 'fullName', source: { kind: 'literal', value: 1 } }, { name: 'extra', source: { kind: 'property', name: 'nope' } }], A1, B1)
    expect(hints.rows).toEqual([
      { type: 'number', expected: 'string', issues: [] },
      { type: null, expected: null, issues: ['The input has no property “nope”.'] },
    ])
    expect(mappingHints([], A1, B1).missing).toEqual([{ name: 'fullName', type: 'string' }])
  })

  it('reads Record A’s JSON, or says it isn’t JSON yet', () => {
    expect(parseRecordData('{"a":1}')).toEqual({ data: { a: 1 } })
    expect(parseRecordData('{a:1}')).toEqual({ error: 'This isn’t valid JSON yet.' })
  })
})

describe('What the language and the playground never do', () => {
  const root = join(import.meta.dirname, '..')
  const files = ['shared/features', 'app/dev/features'].flatMap((dir) => readdirSync(join(root, dir)).map((f) => join(dir, f)))
  const source = (f: string) => readFileSync(join(root, f), 'utf8')

  it('import nothing but each other, Vue and Nuxt’s own composables: no database, network or storage', () => {
    expect(files.length).toBeGreaterThanOrEqual(6)
    for (const f of files) {
      for (const [, from] of source(f).matchAll(/from\s+'([^']+)'/g)) expect(from, `${f} imports ${from}`).toMatch(/^(\.\.?\/|#shared\/features\/)/)
    }
  })

  it('never fetch, store, log or evaluate code', () => {
    const forbidden = /\bconsole\s*\.|\$?fetch\s*\(|useFetch|useAsyncData|localStorage|sessionStorage|indexedDB|document\.cookie|\beval\s*\(|new\s+Function\b|useDb|postgres/
    for (const f of files) expect(source(f), f).not.toMatch(forbidden)
  })

  it('live outside app/pages, so no page route reaches them in a production build', () => {
    const pages = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? pages(join(dir, e.name)) : [join(dir, e.name)]))
    for (const page of pages('app/pages')) expect(source(page), page).not.toMatch(/dev\/features|shared\/features/)
    // The only way in: registered by nuxt.config.ts, and only when playgroundAvailable says so.
    expect(source('nuxt.config.ts')).toMatch(
      /if \(!playgroundAvailable\(\{ dev: nuxt\.options\.dev, context: process\.env\.CONTEXT \}\)\) return\s+nuxt\.hook\('pages:extend'/,
    )
  })
})

describe('Where the playground exists: decided at build time', () => {
  it('in development, and in Netlify Deploy Previews', () => {
    expect(playgroundAvailable({ dev: true, context: undefined })).toBe(true)
    expect(playgroundAvailable({ dev: false, context: 'deploy-preview' })).toBe(true)
  })

  it('never in production, branch deploys, or any build Netlify didn’t label as a preview', () => {
    for (const context of ['production', 'branch-deploy', 'dev', undefined, '', 'Deploy-Preview', 'deploy-preview ', 'deploy-preview-31']) {
      expect(playgroundAvailable({ dev: false, context }), String(context)).toBe(false)
    }
  })
})
