// Phase 4.2, part A: a specific Definition version is named by the name it was published with; the
// catalogue keeps current metadata.
import { describe, expect, it } from 'vitest'
import { defineVersion, refOf } from '../shared/features/definitions'
import { A1, definitionLabel } from '../app/dev/features/experiment'
import { studioCatalogue } from '../app/dev/definitions/catalogue'
import { DEFAULT_APPEARANCE } from '../app/dev/definitions/appearance'
import { initialConfiguration, labelOf } from '../app/dev/designer/config'

const W = 'ws-names'
const CANDIDATE_1 = defineVersion({ id: 'candidate', version: 1, name: 'Candidate', workspaceId: W, fields: [{ name: 'email', type: 'string' }] })
const CANDIDATE_2 = defineVersion({ id: 'candidate', version: 2, name: 'Applicant', workspaceId: W, fields: [{ name: 'email', type: 'string' }, { name: 'phone', type: 'string', optional: true }] })
// Renamed since: the catalogue now calls it "Person"; its versions keep the names they were published with.
const made = [{ id: 'candidate', workspaceId: W, name: 'Person', description: '', appearance: DEFAULT_APPEARANCE, versions: [CANDIDATE_1, CANDIDATE_2] }]

describe('Historical Definition names', () => {
  it('names a referenced version by its publication-time name; the catalogue keeps the current one', () => {
    const catalogue = studioCatalogue(W, made)
    expect(catalogue.blocks[0]!.name).toBe('Person')
    expect(catalogue.label({ id: 'candidate', version: 1 })).toBe('Candidate · v1')
    expect(catalogue.label({ id: 'candidate', version: 2 })).toBe('Applicant · v2')
  })

  it('never borrows another version’s name for one that can’t be resolved', () => {
    expect(studioCatalogue(W, made).label({ id: 'candidate', version: 3 })).toBe('candidate · v3')
  })

  it('names a Definition handed to the Designer by its exact version’s own name, not what it is called now', () => {
    const config = initialConfiguration([{ definition: CANDIDATE_1, name: 'Person', source: 'workspace' }])
    expect(labelOf(config, refOf(CANDIDATE_1))).toBe('Candidate · v1')
    expect(definitionLabel(refOf(A1))).toBe('Definition A · v1')
  })
})
