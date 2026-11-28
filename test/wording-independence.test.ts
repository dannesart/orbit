// Words never decide (Foundation integrity, Part C). Every problem's words come from the experiment's
// describers; here they're all replaced, adversarially, by the very words unfinished work is shown
// with ("Needs a value"), and every assessment in the corpus is made again with the code reloaded.
// Classification, incomplete versus invalid, Apply availability and where the Studio sends you must be
// exactly what they were: if anything read the words back, this changes them.
import { describe, expect, it, vi } from 'vitest'

const ADVERSARIAL = 'Needs a value'

/** Every fact the surfaces act on, for every draft in the corpus, from freshly loaded modules. */
async function facts() {
  const { corpus } = await import('./corpus')
  const { assessApply, canApply } = await import('../app/dev/designer/config')
  const { studioStatus } = await import('../app/dev/designer/studio')
  return corpus().map((c) => {
    const a = assessApply(c.config, c.draft, { feature: c.feature, workspaceId: c.workspaceId })
    const s = studioStatus(a)
    return {
      name: c.name,
      state: a.state,
      applicable: canApply(a),
      problems: a.problems.map((p) => [p.kind, p.category, p.at, p.index, p.reason ?? null]),
      studio: s.state,
      todo: s.todo.map((i) => [i.at, i.where, i.category]),
      fix: s.problems.map((i) => [i.at, i.where, i.category]),
      words: a.problems.map((p) => p.short),
    }
  })
}

describe('Rewording every message changes nothing but the words', () => {
  it('classification, incomplete versus invalid, Apply availability and Studio navigation stay exactly as they were', async () => {
    const before = await facts()
    vi.resetModules()
    vi.doMock('../app/dev/features/experiment', async (importOriginal) => {
      const real = await importOriginal<typeof import('../app/dev/features/experiment')>()
      return {
        ...real,
        describeIssue: () => ADVERSARIAL,
        describeMappingIssue: () => ADVERSARIAL,
        describeDefinitionIssue: () => ADVERSARIAL,
        describeNamingIssues: (issues: readonly unknown[]) => issues.map(() => ADVERSARIAL),
        definitionLabel: () => ADVERSARIAL,
      }
    })
    const after = await facts()
    vi.doUnmock('../app/dev/features/experiment')
    vi.resetModules()

    // The words really did change, wherever they come from a describer, including on problems that aren't unfinished.
    const reworded = after.filter((a, i) => JSON.stringify(a.words) !== JSON.stringify(before[i]!.words))
    expect(reworded.length).toBeGreaterThan(100)
    expect(after.some((a) => a.problems.some((p, j) => p[1] !== 'unfinished' && a.words[j] === ADVERSARIAL))).toBe(true)
    // And nothing else did.
    const strip = ({ words: _, ...rest }: (typeof before)[number]) => rest
    expect(after.map(strip)).toEqual(before.map(strip))
  })
})
