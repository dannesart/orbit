// A corpus of Transform drafts for testing guarantees rather than examples: every combination of a
// few inputs (flat, with an optional property, composed), outputs (required, optional, composed, the
// Transform's own) and Transform versions, with sources good, wrong, incomplete, of capabilities only
// some versions have, and malformed. Plain data, built only from the modules it imports, so a test
// can rebuild it after replacing a module (wording-independence.test.ts).
import { type Data, type DefinitionVersion, type Field, deepFreeze, refOf } from '../shared/features/definitions'
import { type MappingFeature, orbitTransformV1, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import type { Expression, MappingProperty } from '../shared/features/mappings'
import { type Configuration, type TransformDraft, applyConfiguration, draftFrom, initialConfiguration } from '../app/dev/designer/config'
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
  // Inside an expression's list: a nested read (a capability flat versions lack), and a malformed one.
  listedNested: { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [prop('firstName'), { kind: 'path', path: ['contact', 'email'] }] }, { kind: 'literal', value: ' ' }] },
  listedMalformed: { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [prop('firstName'), { kind: 'path', path: 'contact.email' }] }, { kind: 'literal', value: ' ' }] },
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

/** A Definition another workspace made: offered directly (as a caller could, bypassing any picker), it never resolves here. */
export const SECRET = deepFreeze<DefinitionVersion>({ id: 'definition-secret', version: 1, name: 'Secret Payroll', workspaceId: 'ws-x', fields: [{ name: 'salary', type: 'string' }] })
/** A Definition Acme made: it resolves when the step runs in Acme, and nowhere else. */
export const ACME = deepFreeze<DefinitionVersion>({ id: 'definition-acme', version: 1, name: 'Acme label', workspaceId: 'ws-acme', fields: [{ name: 'label', type: 'string' }] })

export function corpus(): Case[] {
  const config = initialConfiguration([NICKED, NICK, MAYBE_NICK, SECRET, ACME].map((definition) => ({ definition, name: definition.name, source: 'workspace' as const })))
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
  // The Transform's own Definition chosen from the catalogue: an existing version, used as itself.
  const own = applyConfiguration(config, { ...draftFrom(config), use: 'local', local: { name: 'Made here', fields: [{ name: 'label', type: 'string' }] }, properties: toDraft([{ name: 'label', source: SOURCES.text as Expression }]) }, { feature: orbitTransformV2, workspaceId: WORKSPACE }).config
  // Resolution that depends on the workspace, and foreign Definitions supplied directly.
  for (const feature of [orbitTransformV1, orbitTransformV2, orbitTransformV3]) {
    for (const [name, source] of [['nothing', null], ['text', 'text'], ['first name', 'firstName']] as const) {
      const properties = toDraft(source ? [{ name: 'label', source: SOURCES[source] as Expression }] : [])
      cases.push({ name: `own output from the catalogue: ${name} (v${feature.version})`, config: own, draft: { ...draftFrom(own), use: 'catalogue', catalogue: { id: 'transform.output', version: 1 }, properties }, feature, workspaceId: WORKSPACE, input: A1, data: INPUTS[0]!.data })
      for (const workspaceId of ['ws-acme', WORKSPACE]) {
        cases.push({ name: `Acme’s output in ${workspaceId}: ${name} (v${feature.version})`, config, draft: { ...draftFrom(config), catalogue: refOf(ACME), properties }, feature, workspaceId, input: A1, data: INPUTS[0]!.data })
      }
      cases.push({ name: `a foreign output supplied directly: ${name} (v${feature.version})`, config, draft: { ...draftFrom(config), catalogue: refOf(SECRET), properties }, feature, workspaceId: WORKSPACE, input: A1, data: INPUTS[0]!.data })
      cases.push({ name: `a foreign input supplied directly: ${name} (v${feature.version})`, config, draft: { ...draftFrom(config), input: refOf(SECRET), properties }, feature, workspaceId: WORKSPACE, input: A1, data: INPUTS[0]!.data })
    }
  }
  // And what's applied already: nothing to apply.
  cases.push({ name: 'the applied configuration (v2)', config, draft: draftFrom(config), feature: orbitTransformV2, workspaceId: WORKSPACE, input: A1, data: INPUTS[0]!.data })
  return cases
}
