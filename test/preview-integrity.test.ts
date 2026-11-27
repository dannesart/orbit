// Foundation integrity, Part D: the Designer's preview and a real run agree, because the preview uses
// the step's Transform version's own checks and its own pure run (transformData), never a copy of
// them, and never invoke: no boundary, no outcome, no evidence.
import { describe, expect, it } from 'vitest'
import { type Data, type DefinitionVersion, defineVersion, refOf } from '../shared/features/definitions'
import { type MappingFeature, invoke, orbitTransformV1, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import type { Mapping, MappingProperty } from '../shared/features/mappings'
import { A1, APPLICANT, B1, DEFINITIONS, INITIAL_MAPPING, PINS, WORKSPACE } from '../app/dev/features/experiment'
import { type OutputPreview, exampleFrom, previewOutput, previewSource } from '../app/dev/designer/preview'
import { readingOf } from '../app/dev/designer/reading'
import { madeFrom } from '../app/dev/designer/studio'

const NICKNAMED = defineVersion({ id: 'nicknamed', version: 1, name: 'Nicknamed', workspaceId: WORKSPACE, fields: [{ name: 'first', type: 'string' }, { name: 'nickname', type: 'string', optional: true }] })
const NICK = defineVersion({ id: 'nick', version: 1, name: 'Nick', workspaceId: WORKSPACE, fields: [{ name: 'first', type: 'string' }, { name: 'nick', type: 'string', optional: true }] })
const ALL = [...DEFINITIONS, NICKNAMED, NICK]
const resolve = (r: { id: string; version: number }) => ALL.find((d) => d.id === r.id && d.version === r.version) ?? null
const prop = (name: string) => ({ kind: 'property', name }) as const
const path = (...p: string[]) => ({ kind: 'path', path: p }) as const
const applicant = PINS.find((p) => p.key === 'applicant')!.example! as Data

/** The draft previewed under a version, and the same Mapping actually run under it. */
function both(feature: MappingFeature, from: DefinitionVersion, to: DefinitionVersion, properties: MappingProperty[], data: Data) {
  const preview: OutputPreview = previewOutput(properties, from, to, exampleFrom(JSON.stringify(data), from, resolve), readingOf(feature, resolve))
  const mapping: Mapping = { id: 'm', version: 1, workspaceId: WORKSPACE, from: refOf(from), to: refOf(to), properties }
  const ran = invoke({ definitions: ALL, records: [{ id: 'r', workspaceId: WORKSPACE, definition: refOf(from), data }], mappings: [mapping] }, { workspaceId: WORKSPACE, feature, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })
  return { preview, ran }
}
const agrees = (r: ReturnType<typeof both>, properties: MappingProperty[]) => {
  expect(r.ran.evidence.outcome).toEqual({ kind: 'succeeded' })
  expect(madeFrom(properties, r.preview)).toEqual(r.ran.output!.data)
  expect(r.preview.fits).toEqual({ issues: [] })
}

describe('Preview and execution agree under the same Transform version', () => {
  it('v1, v2 and v3 on a flat Mapping every one of them accepts', () => {
    const properties = [...INITIAL_MAPPING.properties]
    for (const feature of [orbitTransformV1, orbitTransformV2, orbitTransformV3]) agrees(both(feature, A1, B1, properties, { firstName: ' Ada ', lastName: 'Lovelace' }), properties)
  })

  it('v2 and v3 leave out what reads an absent optional value, as a run does', () => {
    const properties: MappingProperty[] = [{ name: 'first', source: prop('first') }, { name: 'nick', source: prop('nickname') }]
    for (const feature of [orbitTransformV2, orbitTransformV3]) {
      const absent = both(feature, NICKNAMED, NICK, properties, { first: 'Ada' })
      agrees(absent, properties)
      expect(absent.ran.output!.data).toEqual({ first: 'Ada' })
      expect(absent.preview.values[1]).toEqual({ absent: ['nickname'] })
      agrees(both(feature, NICKNAMED, NICK, properties, { first: 'Ada', nickname: 'Countess' }), properties)
    }
  })

  it('v3: nested reads, a construction built only when its source is present, and a whole copy', () => {
    const properties: MappingProperty[] = [
      { name: 'firstName', source: prop('firstName') },
      { name: 'lastName', source: prop('lastName') },
      { name: 'contact', source: { kind: 'construct', presence: { when: 'present', source: ['contact'] }, properties: [{ name: 'email', source: path('contact', 'email') }, { name: 'phone', source: path('contact', 'phone') }] } },
      { name: 'home', source: { kind: 'copy', from: ['home'] } },
    ]
    agrees(both(orbitTransformV3, APPLICANT, APPLICANT, properties, applicant), properties)
    const bare = { ...applicant } as Record<string, unknown>
    delete bare.contact
    const without = both(orbitTransformV3, APPLICANT, APPLICANT, properties, bare as Data)
    agrees(without, properties)
    expect(without.ran.output!.data).not.toHaveProperty('contact')
  })
})

describe('The preview tells the truth about what a version refuses', () => {
  const properties: MappingProperty[] = [{ name: 'first', source: prop('first') }, { name: 'nick', source: prop('nickname') }]

  it('v1 has no behaviour for absence: reading an optional value is refused, never shown as left out', () => {
    const { preview, ran } = both(orbitTransformV1, NICKNAMED, NICK, properties, { first: 'Ada' })
    expect(ran.evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_mapping' })
    expect(preview.values[1]).toHaveProperty('problems')
    expect(preview.values[1]).not.toHaveProperty('absent')
    expect(preview.fits).toBeNull()
  })

  it('flat versions refuse a nested read in the preview as at the boundary', () => {
    const nested: MappingProperty[] = [{ name: 'firstName', source: path('contact', 'email') }]
    for (const feature of [orbitTransformV1, orbitTransformV2]) {
      expect(previewSource(nested[0]!.source, APPLICANT, exampleFrom(JSON.stringify(applicant), APPLICANT, resolve), readingOf(feature, resolve))).toHaveProperty('problems')
    }
  })
})

describe('The preview follows the chosen version’s own run, and is never a run', () => {
  it('shows exactly what that version’s run makes, whatever it is', () => {
    let calls = 0
    // A stand-in version whose run is unlike any real one: the preview can only show this if it uses it.
    const shouting: MappingFeature = { ...orbitTransformV2, version: 99, run: (input, mapping) => { calls++; return Object.fromEntries(mapping.properties.map((p) => [p.name, String(input[(p.source as { name: string }).name]).toUpperCase()])) } }
    const preview = previewOutput([{ name: 'first', source: prop('first') }], NICKNAMED, NICK, exampleFrom(JSON.stringify({ first: 'Ada' }), NICKNAMED), readingOf(shouting, resolve))
    expect(preview.values[0]).toEqual({ value: 'ADA' })
    expect(preview.fits).toEqual({ issues: [] })
    expect(calls).toBeGreaterThan(0)
    // Plain data back: values and fit, nothing like an outcome or evidence.
    expect(Object.keys(preview).sort()).toEqual(['fits', 'values'])
  })

  it('never changes the example or the Mapping it previews', () => {
    const data = { firstName: 'Ada', lastName: 'Lovelace' }
    const properties = structuredClone([...INITIAL_MAPPING.properties])
    const before = structuredClone(properties)
    previewOutput(properties, A1, B1, exampleFrom(JSON.stringify(data), A1), readingOf(orbitTransformV2, resolve))
    expect(properties).toEqual(before)
  })
})
