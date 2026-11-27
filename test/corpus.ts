// A corpus of Transform drafts for testing guarantees rather than examples: every combination of a
// few inputs (flat, with an optional property, composed), outputs (required, optional, composed, the
// Transform's own) and Transform versions, with sources good, wrong, incomplete, of capabilities only
// some versions have, and malformed. Plain data, built only from the modules it imports, so a test
// can rebuild it after replacing a module (wording-independence.test.ts).
import { type Data, type DefinitionVersion, type Field, deepFreeze, refOf } from '../shared/features/definitions'
import { type MappingFeature, orbitTransformV1, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import type { Expression, MappingProperty } from '../shared/features/mappings'
import { type Configuration, type TransformDraft, draftFrom, initialConfiguration } from '../app/dev/designer/config'
import { toDraft } from '../app/dev/designer/parts'
import { A1, APPLICANT, B1, PINS, WORKSPACE } from '../app/dev/features/experiment'

export interface Case {
  readonly name: string
  readonly config: Configuration
  readonly draft: TransformDraft
  readonly feature: MappingFeature
  readonly workspaceId: string
  readonly input: DefinitionVersion
  /** Data valid for the input, to run what was applied with: every example, absent optional values included. */
  readonly data: readonly Data[]
}

const version = (id: string, fields: Field[]): DefinitionVersion => deepFreeze({ id, version: 1, name: `Sample ${id}`, workspaceId: WORKSPACE, fields })
export const NICKED = version('nicked', [{ name: 'first', type: 'string' }, { name: 'nick', type: 'string', optional: true }])
export const NICK = version('nick', [{ name: 'nick', type: 'string' }])
export const MAYBE_NICK = version('maybe-nick', [{ name: 'nick', type: 'string', optional: true }])

const prop = (name: string): Expression => ({ kind: 'property', name })
const SOURCES: Record<string, unknown> = {
  firstName: prop('firstName'), first: prop('first'), nick: prop('nick'), text: { kind: 'literal', value: 'x' }, number: { kind: 'literal', value: 7 },
  missing: prop('missing'), trimmedNick: { kind: 'call', fn: 'trim', args: [prop('nick')] }, trimmedNumber: { kind: 'call', fn: 'trim', args: [{ kind: 'literal', value: 7 }] },
  nested: { kind: 'path', path: ['contact', 'email'] }, nestedCity: { kind: 'path', path: ['home', 'city'] }, malformedPath: { kind: 'path', path: 'contact.email' },
  unknownKind: { kind: 'regex' }, malformedCall: { kind: 'call', fn: 'trim', args: [{ kind: 'nonsense' }] }, unchosenCopy: { kind: 'copy', from: null },
}

const INPUTS: { readonly input: DefinitionVersion; readonly data: readonly Data[] }[] = [
  { input: A1, data: [{ firstName: 'Ada', lastName: 'Lovelace' }] },
  { input: NICKED, data: [{ first: 'Ada' }, { first: 'Ada', nick: 'A' }] },
  { input: APPLICANT, data: [PINS.find((p) => p.key === 'applicant')!.example!] },
]
const OUTPUTS: { readonly name: string; readonly output: DefinitionVersion | { local: Field[] } }[] = [
  { name: 'B1', output: B1 }, { name: 'nick', output: NICK }, { name: 'maybe-nick', output: MAYBE_NICK },
  { name: 'local', output: { local: [{ name: 'label', type: 'string' }] } },
]

/** The drafts for one output: nothing yet, each source alone, a duplicate, and one with no place. */
function propertySets(field: string): { readonly name: string; readonly properties: MappingProperty[] }[] {
  const one = (source: string): MappingProperty => ({ name: field, source: SOURCES[source] as Expression })
  return [
    { name: 'nothing', properties: [] },
    ...Object.keys(SOURCES).map((s) => ({ name: s, properties: [one(s)] })),
    { name: 'twice', properties: [one('text'), one('text')] },
    { name: 'extra', properties: [one('text'), { name: 'elsewhere', source: SOURCES.text as Expression }] },
  ]
}

export function corpus(): Case[] {
  const config = initialConfiguration([NICKED, NICK, MAYBE_NICK].map((definition) => ({ definition, name: definition.name, source: 'workspace' as const })))
  const cases: Case[] = []
  for (const { input, data } of INPUTS) {
    for (const { name: outputName, output } of OUTPUTS) {
      const field = 'local' in output ? output.local[0]!.name : output.fields[0]!.name
      for (const { name, properties } of propertySets(field)) {
        for (const feature of [orbitTransformV1, orbitTransformV2, orbitTransformV3]) {
          const draft: TransformDraft = {
            ...draftFrom(config),
            ...(input === A1 ? {} : { input: refOf(input) }),
            ...('local' in output ? { use: 'local' as const, local: { name: 'Made here', fields: output.local } } : { use: 'catalogue' as const, catalogue: refOf(output) }),
            properties: toDraft(properties),
          }
          cases.push({ name: `${input.id} → ${outputName}: ${name} (v${feature.version})`, config, draft, feature, workspaceId: WORKSPACE, input, data })
        }
      }
    }
  }
  // A contract that doesn't resolve here: another workspace's Definition, as input and as output.
  const theirs = { id: 'their-person-name', version: 1 }
  for (const feature of [orbitTransformV2, orbitTransformV3]) {
    cases.push({ name: `another workspace’s input (v${feature.version})`, config, draft: { ...draftFrom(config), input: theirs }, feature, workspaceId: WORKSPACE, input: A1, data: INPUTS[0]!.data })
    cases.push({ name: `another workspace’s output (v${feature.version})`, config, draft: { ...draftFrom(config), catalogue: theirs }, feature, workspaceId: WORKSPACE, input: A1, data: INPUTS[0]!.data })
  }
  // And what's applied already: nothing to apply.
  cases.push({ name: 'the applied configuration (v2)', config, draft: draftFrom(config), feature: orbitTransformV2, workspaceId: WORKSPACE, input: A1, data: INPUTS[0]!.data })
  return cases
}
