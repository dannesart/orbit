// Realistic experimental fixtures (development only): Definitions, Records and Mappings large enough
// to see how Orbit behaves with real-world shapes (a Candidate with about forty top-level
// properties, nested objects several levels deep, reusable Definitions pinned to exact versions,
// long names, every primitive type, required and optional properties). Synthetic: no real people.
// Only existing domain capabilities: values, local objects, references, optional properties.
//
// This module imports nothing from experiment.ts (which includes these in its DEFINITIONS), so the
// playground's workspace is named here too; a test keeps the two the same.
import { type Data, type DefinitionRef, type DefinitionVersion, type Field, deepFreeze, defineVersion, refOf } from '#shared/features/definitions'
import type { Expression, Mapping, MappingProperty } from '#shared/features/mappings'

/** The playground's workspace (experiment.ts: WORKSPACE). */
export const REALISTIC_WORKSPACE = 'ws-playground'
const W = REALISTIC_WORKSPACE

const s = (name: string, optional = false): Field => ({ name, type: 'string', ...(optional ? { optional: true } : {}) })
const n = (name: string, optional = false): Field => ({ name, type: 'number', ...(optional ? { optional: true } : {}) })
const b = (name: string, optional = false): Field => ({ name, type: 'boolean', ...(optional ? { optional: true } : {}) })
const o = (name: string, fields: Field[], optional = false): Field => ({ name, type: 'object', fields, ...(optional ? { optional: true } : {}) })
const r = (name: string, definition: DefinitionRef, optional = false): Field => ({ name, type: 'reference', definition: refOf(definition), ...(optional ? { optional: true } : {}) })

// --- Reusable Definitions, each pinned by exact version where it's used ---

/** Address v1 is the playground's existing one (experiment.ts); v2 is the fuller postal address. */
export const ADDRESS_V1 = defineVersion({ id: 'address', version: 1, name: 'Address', workspaceId: W, fields: [s('street'), s('city'), s('postcode', true)] })
export const ADDRESS_V2 = defineVersion({ id: 'address', version: 2, name: 'Address', workspaceId: W, fields: [
  s('addressLineOne'), s('addressLineTwo', true), s('city'), s('regionOrStateOrProvince', true), s('postalCode'), s('countryCode'),
] })

const known: DefinitionVersion[] = [ADDRESS_V1, ADDRESS_V2]
const resolve = (ref: DefinitionRef) => known.find((d) => d.id === ref.id && d.version === ref.version) ?? null
const define = (d: Parameters<typeof defineVersion>[0]) => {
  const version = defineVersion(d, resolve)
  known.push(version)
  return version
}

/** Pins Address v1 on purpose: a reusable Definition need not be on its latest version everywhere. */
export const EMERGENCY_CONTACT = define({ id: 'emergency-contact', version: 1, name: 'Emergency contact', workspaceId: W, fields: [
  s('fullName'), s('relationshipToPerson'), s('mobilePhoneNumber'), s('alternativePhoneNumber', true), s('emailAddress', true),
  r('postalAddress', ADDRESS_V1, true), b('mayBeContactedOutsideWorkingHours'),
] })

export const EMPLOYMENT = define({ id: 'employment', version: 1, name: 'Employment', workspaceId: W, fields: [
  s('employmentType'), s('jobTitle'), s('department'), s('costCentreCode', true), s('employmentStartDate'), n('probationPeriodInMonths'),
  n('weeklyContractedHours'), b('isEligibleForRemoteWork'),
  o('reportingManager', [s('fullName'), s('employeeNumber'), s('workEmailAddress', true)]),
  o('compensation', [
    n('annualGrossSalaryAmount'), s('currencyCode'), s('payFrequency'),
    o('bonusEligibility', [b('isEligible'), n('targetBonusPercentage', true)], true),
  ]),
] })

/** About forty top-level properties: required and optional, every type, nested three levels deep. */
export const CANDIDATE = define({ id: 'job-candidate', version: 1, name: 'Candidate', workspaceId: W, fields: [
  s('candidateReference'), s('legalFirstName'), s('legalMiddleNames', true), s('legalLastName'),
  s('preferredNameForInternalCommunication', true), s('pronouns', true), s('dateOfBirth'), s('nationalityCountryCode'),
  s('emailAddress'), s('secondaryEmailAddress', true),
  o('contactDetails', [s('mobilePhoneNumber'), s('homePhoneNumber', true), s('preferredContactMethod', true), s('preferredContactTimeWindow', true)]),
  r('homeAddress', ADDRESS_V2), r('correspondenceAddress', ADDRESS_V2, true),
  r('emergencyContact', EMERGENCY_CONTACT, true),
  b('hasRightToWorkInCountryOfEmployment'), b('requiresWorkVisaSponsorshipForEmployment'), s('workPermitExpiryDate', true),
  s('highestCompletedEducationLevel'), s('fieldOfStudy', true), n('yearsOfRelevantProfessionalExperience'),
  s('currentEmployerName', true), s('currentJobTitle', true), n('noticePeriodInWeeks'),
  n('expectedAnnualSalaryAmount', true), s('expectedSalaryCurrencyCode', true),
  s('earliestPossibleStartDate'), b('isWillingToRelocate'), b('isOpenToHybridWorkingArrangement'),
  s('linkedInProfileUrl', true), s('personalWebsiteOrPortfolioUrl', true),
  o('application', [
    s('appliedForPositionTitle'), s('applicationSubmittedOn'), s('sourceOfApplication'),
    o('referral', [s('referrerFullName'), s('referrerEmployeeNumber', true)], true),
    o('screening', [
      b('passedInitialScreening'), s('screenedByRecruiterName'),
      o('interviewScores', [n('technicalAssessmentScore'), n('communicationScore'), n('culturalAlignmentScore', true)], true),
    ]),
  ]),
  o('offer', [
    s('offeredJobTitle'), s('offeredDepartment'), s('offeredEmploymentType'), n('offeredAnnualGrossSalaryAmount'), s('offeredCurrencyCode'),
    s('offeredPayFrequency'), n('offeredWeeklyContractedHours'), n('offeredProbationPeriodInMonths'), s('proposedStartDate'),
    s('hiringManagerFullName'), s('hiringManagerEmployeeNumber'), s('hiringManagerWorkEmailAddress', true), s('offeredCostCentreCode', true),
  ], true),
  o('workPreferences', [b('prefersRemoteWork'), s('preferredOfficeLocation', true), n('maximumCommuteInMinutes', true)], true),
  o('accessibilityAndAdjustments', [b('requiresWorkplaceAdjustments'), s('describedAdjustmentNeeds', true)], true),
  b('consentToDataProcessingForRecruitment'), s('consentGivenOn'),
  s('backgroundCheckStatus'), s('internalRecruiterNotes', true),
  n('candidateRatingOutOfFive', true),
] })

export const EMPLOYEE = define({ id: 'employee', version: 1, name: 'Employee', workspaceId: W, fields: [
  s('employeeNumber'), s('legalFirstName'), s('legalLastName'), s('preferredName', true), s('workEmailAddress'), s('personalEmailAddress'),
  s('dateOfBirth'), r('homeAddress', ADDRESS_V2), r('employment', EMPLOYMENT, true), r('emergencyContact', EMERGENCY_CONTACT, true),
  o('workPreferences', [b('prefersRemoteWork'), s('preferredOfficeLocation', true)], true),
  b('hasRightToWorkInCountryOfEmployment'),
] })

/** What extracting a Candidate's contact information makes. */
export const CANDIDATE_CONTACT = define({ id: 'candidate-contact', version: 1, name: 'Candidate contact', workspaceId: W, fields: [
  s('fullName'), s('emailAddress'), s('mobilePhoneNumber'), s('preferredContactMethod', true), r('postalAddress', ADDRESS_V2),
  r('emergencyContact', EMERGENCY_CONTACT, true),
] })

/** Every realistic Definition version, references before what uses them. Address v1 is experiment.ts's own. */
export const REALISTIC_DEFINITIONS: readonly DefinitionVersion[] = deepFreeze([ADDRESS_V2, EMERGENCY_CONTACT, EMPLOYMENT, CANDIDATE, EMPLOYEE, CANDIDATE_CONTACT])

// --- Records: two Candidates on the same Definition version, different values and optional presence ---

export interface PlaygroundRecord {
  readonly id: string
  readonly name: string
  readonly definition: DefinitionRef
  readonly data: Data
  readonly note: string
}

/** Every optional property present, an offer made, a referral, interview scores. */
export const CANDIDATE_AMARA: Data = deepFreeze({
  candidateReference: 'CAND-2026-00417', legalFirstName: 'Amara', legalMiddleNames: 'Ngozi Elise', legalLastName: 'Okafor-Lindqvist',
  preferredNameForInternalCommunication: 'Amara', pronouns: 'she/her', dateOfBirth: '1991-03-14', nationalityCountryCode: 'SE',
  emailAddress: 'amara.okafor@example.com', secondaryEmailAddress: 'a.lindqvist@example.org',
  contactDetails: { mobilePhoneNumber: '+46 70 123 45 67', homePhoneNumber: '+46 8 555 010 20', preferredContactMethod: 'email', preferredContactTimeWindow: 'Weekdays 09:00–12:00' },
  homeAddress: { addressLineOne: 'Storgatan 12', addressLineTwo: 'Lägenhet 1102', city: 'Stockholm', regionOrStateOrProvince: 'Stockholms län', postalCode: '114 51', countryCode: 'SE' },
  correspondenceAddress: { addressLineOne: 'Box 4471', city: 'Stockholm', postalCode: '102 64', countryCode: 'SE' },
  emergencyContact: {
    fullName: 'Johan Lindqvist', relationshipToPerson: 'Partner', mobilePhoneNumber: '+46 70 765 43 21', alternativePhoneNumber: '+46 8 555 010 21',
    emailAddress: 'johan.lindqvist@example.org', postalAddress: { street: 'Storgatan 12', city: 'Stockholm', postcode: '114 51' }, mayBeContactedOutsideWorkingHours: true,
  },
  hasRightToWorkInCountryOfEmployment: true, requiresWorkVisaSponsorshipForEmployment: false, workPermitExpiryDate: '2031-12-31',
  highestCompletedEducationLevel: 'Master’s degree', fieldOfStudy: 'Human–computer interaction', yearsOfRelevantProfessionalExperience: 9,
  currentEmployerName: 'Nordlys Analytics AB', currentJobTitle: 'Senior product designer', noticePeriodInWeeks: 12,
  expectedAnnualSalaryAmount: 780000, expectedSalaryCurrencyCode: 'SEK',
  earliestPossibleStartDate: '2027-03-01', isWillingToRelocate: false, isOpenToHybridWorkingArrangement: true,
  linkedInProfileUrl: 'https://www.linkedin.com/in/example-amara', personalWebsiteOrPortfolioUrl: 'https://amara.example.com',
  application: {
    appliedForPositionTitle: 'Lead product designer', applicationSubmittedOn: '2026-10-02', sourceOfApplication: 'Employee referral',
    referral: { referrerFullName: 'Saga Berg', referrerEmployeeNumber: 'E-10233' },
    screening: { passedInitialScreening: true, screenedByRecruiterName: 'Leo Hassan', interviewScores: { technicalAssessmentScore: 4.5, communicationScore: 5, culturalAlignmentScore: 4 } },
  },
  offer: {
    offeredJobTitle: 'Lead product designer', offeredDepartment: 'Product design', offeredEmploymentType: 'Permanent, full time',
    offeredAnnualGrossSalaryAmount: 795000, offeredCurrencyCode: 'SEK', offeredPayFrequency: 'Monthly', offeredWeeklyContractedHours: 40,
    offeredProbationPeriodInMonths: 6, proposedStartDate: '2027-03-01', hiringManagerFullName: 'Ingrid Svensson',
    hiringManagerEmployeeNumber: 'E-10007', hiringManagerWorkEmailAddress: 'ingrid.svensson@example.com', offeredCostCentreCode: 'CC-4410',
  },
  workPreferences: { prefersRemoteWork: false, preferredOfficeLocation: 'Stockholm, Kungsholmen', maximumCommuteInMinutes: 45 },
  accessibilityAndAdjustments: { requiresWorkplaceAdjustments: true, describedAdjustmentNeeds: 'Height-adjustable desk' },
  consentToDataProcessingForRecruitment: true, consentGivenOn: '2026-10-02',
  backgroundCheckStatus: 'Completed', internalRecruiterNotes: 'Strong systems thinking; asked about design-system ownership.',
  candidateRatingOutOfFive: 4.5,
})

/** Only what's required: no offer, no emergency contact, no optional objects or values. */
export const CANDIDATE_TOMASZ: Data = deepFreeze({
  candidateReference: 'CAND-2026-00532', legalFirstName: 'Tomasz', legalLastName: 'Wiśniewski', dateOfBirth: '1998-11-02', nationalityCountryCode: 'PL',
  emailAddress: 'tomasz.w@example.net',
  contactDetails: { mobilePhoneNumber: '+48 600 100 200' },
  homeAddress: { addressLineOne: 'ul. Długa 5', city: 'Gdańsk', postalCode: '80-831', countryCode: 'PL' },
  hasRightToWorkInCountryOfEmployment: false, requiresWorkVisaSponsorshipForEmployment: true,
  highestCompletedEducationLevel: 'Bachelor’s degree', yearsOfRelevantProfessionalExperience: 3, noticePeriodInWeeks: 4,
  earliestPossibleStartDate: '2027-01-15', isWillingToRelocate: true, isOpenToHybridWorkingArrangement: true,
  application: {
    appliedForPositionTitle: 'Backend engineer', applicationSubmittedOn: '2026-11-11', sourceOfApplication: 'Careers site',
    screening: { passedInitialScreening: false, screenedByRecruiterName: 'Leo Hassan' },
  },
  consentToDataProcessingForRecruitment: true, consentGivenOn: '2026-11-11', backgroundCheckStatus: 'Not started',
})

export const CANDIDATE_RECORDS: readonly PlaygroundRecord[] = deepFreeze([
  { id: 'candidate-amara', name: 'Candidate: Amara', definition: refOf(CANDIDATE), data: CANDIDATE_AMARA, note: 'Every optional property present, with an offer.' },
  { id: 'candidate-tomasz', name: 'Candidate: Tomasz', definition: refOf(CANDIDATE), data: CANDIDATE_TOMASZ, note: 'Only what Candidate · v1 requires: no offer, no emergency contact.' },
])

// --- Mappings (Transform v3: nested reads, built objects, exact copies) ---
// Identified as the Designer identifies a Mapping between two contracts (config.ts: mappingIdFor), so
// a workflow starts with its Mapping applied and nothing unapplied; a test keeps the two the same.

const prop = (name: string): Expression => ({ kind: 'property', name })
const path = (...names: string[]): Expression => ({ kind: 'path', path: names })
const lit = (value: string): Expression => ({ kind: 'literal', value })
const copy = (...from: string[]): Expression => ({ kind: 'copy', from })
const build = (properties: MappingProperty[], when?: string[]): Expression => ({ kind: 'construct', presence: when ? { when: 'present', source: when } : { when: 'always' }, properties })
const same = (...names: string[]): MappingProperty[] => names.map((name) => ({ name, source: prop(name) }))
const offer = (name: string, from: string): MappingProperty => ({ name, source: path('offer', from) })

/**
 * Candidate · v1 → Employee · v1. Employment is built only when the Candidate has an offer (Employee's
 * employment is optional: it's set once an offer is accepted), so Tomasz, who has none, becomes an
 * Employee without employment, and nothing is invented for it.
 */
export const CANDIDATE_TO_EMPLOYEE: Mapping = deepFreeze({
  id: 'transform:job-candidate@1->employee@1', version: 1, workspaceId: W, from: refOf(CANDIDATE), to: refOf(EMPLOYEE),
  properties: [
    { name: 'employeeNumber', source: prop('candidateReference') },
    ...same('legalFirstName', 'legalLastName'),
    { name: 'preferredName', source: prop('preferredNameForInternalCommunication') },
    { name: 'workEmailAddress', source: prop('emailAddress') },
    { name: 'personalEmailAddress', source: prop('emailAddress') },
    ...same('dateOfBirth', 'hasRightToWorkInCountryOfEmployment'),
    { name: 'homeAddress', source: copy('homeAddress') },
    { name: 'employment', source: build([
      offer('employmentType', 'offeredEmploymentType'), offer('jobTitle', 'offeredJobTitle'), offer('department', 'offeredDepartment'),
      offer('costCentreCode', 'offeredCostCentreCode'), offer('employmentStartDate', 'proposedStartDate'),
      offer('probationPeriodInMonths', 'offeredProbationPeriodInMonths'), offer('weeklyContractedHours', 'offeredWeeklyContractedHours'),
      { name: 'isEligibleForRemoteWork', source: prop('isOpenToHybridWorkingArrangement') },
      { name: 'reportingManager', source: build([
        offer('fullName', 'hiringManagerFullName'), offer('employeeNumber', 'hiringManagerEmployeeNumber'), offer('workEmailAddress', 'hiringManagerWorkEmailAddress'),
      ]) },
      { name: 'compensation', source: build([
        offer('annualGrossSalaryAmount', 'offeredAnnualGrossSalaryAmount'), offer('currencyCode', 'offeredCurrencyCode'), offer('payFrequency', 'offeredPayFrequency'),
      ]) },
    ], ['offer']) },
    { name: 'emergencyContact', source: copy('emergencyContact') },
    { name: 'workPreferences', source: build([
      { name: 'prefersRemoteWork', source: path('workPreferences', 'prefersRemoteWork') },
      { name: 'preferredOfficeLocation', source: path('workPreferences', 'preferredOfficeLocation') },
    ], ['workPreferences']) },
  ],
})

/** Candidate · v1 → Candidate contact · v1: who to contact and how. */
export const CANDIDATE_CONTACT_MAPPING: Mapping = deepFreeze({
  id: 'transform:job-candidate@1->candidate-contact@1', version: 1, workspaceId: W, from: refOf(CANDIDATE), to: refOf(CANDIDATE_CONTACT),
  properties: [
    { name: 'fullName', source: { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [prop('legalFirstName'), lit(' '), prop('legalLastName')] }, lit('')] } },
    { name: 'emailAddress', source: prop('emailAddress') },
    { name: 'mobilePhoneNumber', source: path('contactDetails', 'mobilePhoneNumber') },
    { name: 'preferredContactMethod', source: path('contactDetails', 'preferredContactMethod') },
    { name: 'postalAddress', source: copy('homeAddress') },
    { name: 'emergencyContact', source: copy('emergencyContact') },
  ],
})
