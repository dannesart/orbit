// Scalable General and Designer inspectors (Related to #52), rendered as the page renders them
// (surfaces.ts), with the realistic Candidates. General keeps the output close whatever the input's
// size: a large contract is first what it holds, its structure on demand, nested parts folded, and
// searchable. Inspectors show every name and value whole (wrapping, never "tr…"), nested values open
// on their own at every depth, and a built object's example opens with its own button, never the
// row's, which opens Mapping Studio. Absent stays absent, empty stays empty.
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import { resolverIn, orbitTransformV3 } from '../shared/features/features'
import { DEFINITIONS, WORKSPACE } from '../app/dev/features/experiment'
import { CANDIDATE, CANDIDATE_AMARA, CANDIDATE_TOMASZ, CANDIDATE_TO_EMPLOYEE } from '../app/dev/features/realistic'
import { draftFrom, initialConfiguration } from '../app/dev/designer/config'
import { FLAT, READING } from '../app/dev/designer/reading'
import { contractSize, findInTree, inputTree } from '../app/dev/designer/studio'
import { renderSurface } from './surfaces'

vi.setConfig({ testTimeout: 60_000 })

const config = initialConfiguration([], CANDIDATE_TO_EMPLOYEE)
const draft = draftFrom(config)
const v3 = { feature: orbitTransformV3, workspaceId: WORKSPACE }
const amara = JSON.stringify(CANDIDATE_AMARA, null, 2)
const resolve = resolverIn(DEFINITIONS, WORKSPACE)
const bare = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')
const text = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('General keeps the output close, whatever the input’s size', () => {
  const general = () => renderSurface('Mapping Studio', config, draft, v3, amara, { start: { segment: 'general' }, incoming: { step: 'Console · Step 1', ref: { id: CANDIDATE.id, version: 1 } } })

  it('shows a large input as what it holds, its structure one disclosure away', async () => {
    const html = await general()
    const input = html.slice(html.indexOf('data-general-input'), html.indexOf('data-general-output'))
    expect(input).toMatch(/data-contract-overview data-large/)
    expect(text(input)).toMatch(/39 properties .*objects .*Definitions .* at every depth Show structure/)
    expect(input).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-contract-toggle/)
    // Folded: no row of the input is rendered until asked, so nothing pushes the output away.
    expect(input).not.toMatch(/data-input-node=/)
    // The output's own choice and structure follow straight after.
    const output = html.slice(html.indexOf('data-general-output'))
    expect(output).toMatch(/id="output-definition"/)
    expect(output).toMatch(/data-output-properties[\s\S]*data-input-node="employment"/)
  })

  it('keeps a small contract readable at once, its nested parts folded', async () => {
    const html = await general()
    // Employee has 12 top-level properties: shown at once, its references folded (nothing inside them rendered).
    const output = html.slice(html.indexOf('data-output-properties'))
    expect(output).toMatch(/data-input-node="homeAddress"/)
    expect(output).not.toMatch(/data-input-node="homeAddress › city"/)
    expect(output).not.toMatch(/data-contract-toggle/)
  })

  it('counts what a contract holds at every depth, and finds a property by name with what leads to it', () => {
    const nodes = inputTree(CANDIDATE, { ...FLAT, resolve })
    const size = contractSize(nodes)
    expect(nodes).toHaveLength(39)
    expect(size.objects).toBeGreaterThanOrEqual(7)
    expect(size.references).toBeGreaterThanOrEqual(3)
    expect(size.properties).toBeGreaterThan(80)
    const found = findInTree(nodes, 'interview')
    expect(found.map((n) => n.name)).toEqual(['application'])
    expect(found[0]!.children.map((n) => n.name)).toEqual(['screening'])
    expect(found[0]!.children[0]!.children.map((n) => n.name)).toEqual(['interviewScores'])
    expect(findInTree(nodes, '  ')).toHaveLength(39)
    expect(findInTree(nodes, 'nothing-like-this')).toEqual([])
  })
})

describe('Observed values, readable at any size', () => {
  const observed = async (data: unknown, query = '') => {
    const { default: ObservedTree } = await import('../app/dev/designer/ObservedTree.vue')
    const app = vue.createSSRApp(ObservedTree, { data, fields: CANDIDATE.fields, resolve, label: (r: { id: string; version: number }) => `${resolve(r)?.name ?? r.id} · v${r.version}`, query })
    app.provide(READING, vue.ref(FLAT))
    return renderToString(app)
  }

  it('shows every name and value whole: a boolean is never cut short, a long name wraps', async () => {
    const html = await observed(CANDIDATE_AMARA)
    expect(html).not.toMatch(/\btruncate\b/)
    const row = html.match(/<li[^>]*data-observed="requiresWorkVisaSponsorshipForEmployment"[\s\S]*?<\/li>/)![0]
    expect(text(row)).toContain('requiresWorkVisaSponsorshipForEmployment')
    expect(bare(row)).toMatch(/whitespace-pre-wrap[^>]*>false</)
    expect(row).toMatch(/flex-wrap/)
  })

  it('says absent for an optional value that isn’t there, and keeps objects folded, opening each on its own', async () => {
    const html = await observed(CANDIDATE_TOMASZ)
    expect(text(html.match(/<li[^>]*data-observed="legalMiddleNames"[\s\S]*?<\/li>/)![0])).toContain('absent')
    expect(html).toMatch(/data-observed="contactDetails"[\s\S]*?aria-expanded="false"/)
    expect(html).not.toMatch(/data-observed="mobilePhoneNumber"/)
  })

  it('finds a property by name, opening what leads to it at every depth', async () => {
    const html = await observed(CANDIDATE_AMARA, 'culturalAlignment')
    expect(html.match(/data-observed="[^"]+"/g)).toEqual(['data-observed="application"', 'data-observed="screening"', 'data-observed="interviewScores"', 'data-observed="culturalAlignmentScore"'])
    expect(await observed(CANDIDATE_AMARA, 'no-such-name')).toContain('Nothing by that name')
    // An object whose own name matches opens too when what's inside it matches as well.
    const scores = await observed(CANDIDATE_AMARA, 'score')
    expect(scores).toMatch(/data-observed="interviewScores"[\s\S]*data-observed="technicalAssessmentScore"/)
  })
})

describe('The Transform inspector with realistic data', () => {
  const inspector = () => renderSurface('inspector', config, draft, v3, amara)

  it('keeps each property’s status, how it’s made, its example and the way to Mapping Studio, names and values whole', async () => {
    const html = await inspector()
    const row = html.match(/<li[^>]*data-output-row="workEmailAddress"[\s\S]*?<\/li>/)![0]
    expect(row).toMatch(/data-property-row="workEmailAddress"[^>]*aria-label="workEmailAddress, text, Mapped: emailAddress\. Example: amara\.okafor@example\.com, not executed\. Edit in Mapping Studio"/)
    expect(row).not.toMatch(/\btruncate\b/)
    expect(bare(row)).toMatch(/whitespace-pre-wrap[^>]*>amara\.okafor@example\.com</)
  })

  it('opens a built object’s example with its own button, never the row’s, which opens Mapping Studio', async () => {
    const onStudio = vi.fn()
    const html = await renderSurface('inspector', config, draft, v3, amara, { onStudio })
    const row = html.match(/<li[^>]*data-output-row="employment"[\s\S]*?(?=<li[^>]*data-output-row=)/)![0]
    const rowButton = row.match(/<button[^>]*data-property-row="employment"[\s\S]*?<\/button>/)![0]
    expect(rowButton).not.toMatch(/data-row-expand/)
    expect(row.slice(row.indexOf(rowButton) + rowButton.length)).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="example-employment"[^>]*data-row-expand/)
    expect(text(row)).toContain('Show example values of employment')
    expect(onStudio).not.toHaveBeenCalled()
  })

  it('offers no search for an output that fits in view', async () => {
    expect(await inspector()).not.toMatch(/data-output-search/)
  })
})
