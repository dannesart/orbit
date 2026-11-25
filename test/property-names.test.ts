// Orbit's one rule for naming properties when a version is made (Experiment #9, after Phase 0),
// and that data is still matched exactly: the rule never reaches incoming keys.
import { describe, expect, it } from 'vitest'
import { checkPropertyNames, defineVersion, validate } from '../shared/features/definitions'
import { ORBIT_PROVIDED } from '../app/dev/definitions/model'
import { DEFINITIONS } from '../app/dev/features/experiment'

const problems = (...names: string[]) => checkPropertyNames(names).map((i) => i.problem)
const NFC = 'café' // é as one character
const NFD = 'café' // e and a combining acute accent

describe('The naming rule', () => {
  it('allows internal spaces, dots and any script', () => {
    expect(checkPropertyNames(['first name', 'a.b', 'a', 'b', 'gatuadress', 'Straße', '名前', 'имя', NFC, 'e-mail', '1st'])).toEqual([])
  })

  it('refuses empty names and leading or trailing whitespace of any kind', () => {
    expect(checkPropertyNames(['', 'a'])).toEqual([{ problem: 'empty_name', path: [''] }])
    for (const name of [' a', 'a ', '\ta', 'a\n', ' a', 'a　', ' a']) {
      expect(checkPropertyNames([name])).toEqual([{ problem: 'surrounding_whitespace', path: [name] }])
    }
  })

  it('refuses sibling names that are equal, differ only by case, or are canonically equivalent', () => {
    expect(checkPropertyNames(['a', 'a'])).toEqual([{ problem: 'duplicate_name', path: ['a'] }])
    expect(checkPropertyNames(['Email', 'email'])).toEqual([{ problem: 'differs_only_by_case', path: ['email'], other: 'Email' }])
    expect(problems('Straße', 'STRASSE')).toEqual(['differs_only_by_case'])
    expect(problems('ÅSA', 'åsa')).toEqual(['differs_only_by_case'])
    expect(checkPropertyNames([NFC, NFD])).toEqual([{ problem: 'equivalent_unicode', path: [NFD], other: NFC }])
    // Both at once (a different case and a different encoding): still one name twice.
    expect(problems('CAFÉ', NFD)).toEqual(['differs_only_by_case'])
  })

  it('has the documented limits of its case comparison (strict: it only ever refuses more)', () => {
    for (const [a, b] of [['ß', 'SS'], ['ß', 'ss'], ['ı', 'i'], ['İ', 'i̇'], ['ς', 'σ'], ['ﬁ', 'fi']]) {
      expect(problems(a!, b!), `${a} / ${b}`).toEqual(['differs_only_by_case'])
    }
    expect(problems('Ａ', 'A')).toEqual([]) // full-width: compatibility, not canonical, equivalence
  })

  it('locates each problem at the name it is about, under its parent', () => {
    expect(checkPropertyNames(['x', 'X'], ['contact'])).toEqual([{ problem: 'differs_only_by_case', path: ['contact', 'X'], other: 'x' }])
  })

  it('is applied when a version is made: refused, never tidied', () => {
    const make = (...names: string[]) => () => defineVersion({ id: 'd', version: 1, name: 'D', workspaceId: 'w', fields: names.map((name) => ({ name, type: 'string' as const })) })
    for (const bad of [[''], [' a'], ['a', 'a'], ['Email', 'email'], [NFC, NFD]]) expect(make(...bad)).toThrow(/can’t be made/)
    expect(make('first name', 'a.b', 'Straße')().fields.map((f) => f.name)).toEqual(['first name', 'a.b', 'Straße'])
  })

  it('holds for every version Orbit and the experiment already publish, so none needs rewriting', () => {
    for (const v of [...ORBIT_PROVIDED, ...DEFINITIONS]) expect(checkPropertyNames(v.fields.map((f) => f.name))).toEqual([])
  })
})

describe('Data is still matched exactly', () => {
  const d = defineVersion({ id: 'd', version: 1, name: 'D', workspaceId: 'w', fields: [{ name: 'email', type: 'string' }, { name: NFC, type: 'string' }] })

  it('is case-sensitive: "Email" never satisfies "email"', () => {
    expect(validate(d, { Email: 'x', [NFC]: 'y' })).toEqual([
      { problem: 'missing', path: ['email'], expected: 'string' },
      { problem: 'unexpected', path: ['Email'] },
    ])
  })

  it('never normalizes keys: a differently encoded key is a different key', () => {
    expect(validate(d, { email: 'x', [NFD]: 'y' })).toEqual([
      { problem: 'missing', path: [NFC], expected: 'string' },
      { problem: 'unexpected', path: [NFD] },
    ])
  })

  it('never trims keys', () => {
    expect(validate(d, { 'email ': 'x', [NFC]: 'y' }).map((i) => i.problem)).toEqual(['missing', 'unexpected'])
  })
})
