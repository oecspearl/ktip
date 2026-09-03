import { z } from 'zod'
import { i18n, type MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { COLLABORATION_LEGACY_LABELS, COLLABORATION_OPTIONS, SELECTABLE_ROLES } from './constants'

// User Authentication Schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

// Password requirements drive both the signup schema and the live
// checklist UI, so they can never drift apart.
//
// msg descriptors, not strings, and the message is composed INSIDE the
// superRefine callback: zod messages written at module scope are frozen in
// whatever language was active at import time, which is always English.
// Resolving through the i18n singleton at validation time gives the message
// the language the reader is actually in.
export const PASSWORD_REQUIREMENTS: { id: string; label: MessageDescriptor; test: (pw: string) => boolean }[] = [
  { id: 'length', label: msg`At least 8 characters`, test: (pw) => pw.length >= 8 },
  { id: 'number', label: msg`At least one number`, test: (pw) => /\d/.test(pw) },
  { id: 'symbol', label: msg`At least one symbol (e.g. !@#$%)`, test: (pw) => /[^a-zA-Z0-9\s]/.test(pw) },
  { id: 'case', label: msg`Upper and lowercase letters`, test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
]

const passwordSchema = z.string().superRefine((pw, ctx) => {
  for (const req of PASSWORD_REQUIREMENTS) {
    if (!req.test(pw)) {
      const requirement = i18n._(req.label).toLocaleLowerCase()
      ctx.addIssue({ code: 'custom', message: t`Password needs: ${requirement}` })
      return
    }
  }
})

/**
 * The roles signup will accept, derived from the grid rather than restated.
 * Hand-maintained, this list fell behind SELECTABLE_ROLES and left the
 * Researcher card rejecting itself with "Please select a role".
 *
 * A verification-gated role passes validation and is sent as signup metadata;
 * the 063 insert guard is what stops it reaching profiles.roles, and
 * onboarding turns it into a review request.
 */
export const SIGNUP_ROLES = SELECTABLE_ROLES.map((r) => r.value) as unknown as [string, ...string[]]

/** Youngest account KTIP will create. Under this, signup is refused outright. */
export const MINIMUM_SIGNUP_AGE = 13
/** At or above this, the account is an adult; below it runs in minor-safe mode. */
export const ADULT_AGE = 18

/**
 * Whole years between a date of birth and a reference date. Calendar-correct —
 * subtracting years and comparing month/day, not dividing milliseconds, because
 * leap years make the arithmetic version wrong by a day around a birthday and
 * that day is the difference between a minor and an adult account.
 */
export function ageOn(dob: Date, on: Date = new Date()): number {
  let age = on.getFullYear() - dob.getFullYear()
  const monthDelta = on.getMonth() - dob.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && on.getDate() < dob.getDate())) age -= 1
  return age
}

/**
 * Today as `YYYY-MM-DD` in the *browser's* timezone, for the `max` attribute on
 * a date input. `toISOString()` would be UTC and hand someone in the Caribbean a
 * ceiling that is a day ahead of their own calendar.
 */
export function todayIso(on: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${on.getFullYear()}-${pad(on.getMonth() + 1)}-${pad(on.getDate())}`
}

/** True when a declared date of birth belongs to someone under 18. */
export function isMinorDob(value: string, on: Date = new Date()): boolean {
  const parsed = parseDobInput(value)
  return parsed !== null && ageOn(parsed, on) < ADULT_AGE
}

/**
 * `<input type="date">` yields `YYYY-MM-DD`. Parsed as local time rather than
 * with `new Date(value)`, which reads that form as UTC and lands on the previous
 * day for anyone west of Greenwich — i.e. every OECS member state.
 */
function parseDobInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  // Rejects 2024-02-31 and friends, which the Date constructor silently rolls over.
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(m) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null
  }
  return date
}

/**
 * Date of birth, shared by the email signup wizard and the post-OAuth
 * onboarding form so the two can never disagree about who counts as an adult.
 * Mirrored server-side in declare_date_of_birth() (migration 091).
 */
export const dateOfBirthSchema = z
  .string()
  .min(1, 'Date of birth is required')
  .superRefine((value, ctx) => {
    // t`` here is fine — superRefine callbacks run at PARSE time, so the
    // message resolves in the reader's language. Only the schema-builder
    // arguments (.min(1, '…')) are frozen at module scope.
    const parsed = parseDobInput(value)
    if (!parsed) {
      ctx.addIssue({ code: 'custom', message: t`Enter a valid date of birth` })
      return
    }
    if (parsed.getTime() > Date.now()) {
      ctx.addIssue({ code: 'custom', message: t`Date of birth cannot be in the future` })
      return
    }
    const age = ageOn(parsed)
    if (age < MINIMUM_SIGNUP_AGE) {
      const minimumAge = MINIMUM_SIGNUP_AGE
      ctx.addIssue({
        code: 'custom',
        message: t`You must be at least ${minimumAge} to use KTIP`,
      })
      return
    }
    if (age > 120) {
      ctx.addIssue({ code: 'custom', message: t`Enter a valid date of birth` })
    }
  })
/**
 * The six-digit code, shared by three screens (118): the email OTP that ends
 * signup, the TOTP code that finishes enrolment, and the TOTP challenge on every
 * later sign-in. One schema so the three cannot drift.
 *
 * NOTE the shape. `.length(6, '…')` is the obvious way to write this and it is
 * the wrong way — a schema-builder argument freezes in English at import time.
 * The check has to live inside superRefine, where it runs at parse time and
 * resolves in the reader's language. See the note on PASSWORD_REQUIREMENTS.
 */
export const otpCodeSchema = z.string().superRefine((value, ctx) => {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length === 0) {
    ctx.addIssue({ code: 'custom', message: t`Enter the code we sent you` })
    return
  }
  if (digits.length !== 6) {
    ctx.addIssue({ code: 'custom', message: t`The code is 6 digits` })
  }
})

/**
 * A recovery code. Mirrors the normalisation consume_mfa_backup_code() does in
 * SQL (118), so a mistyped code is refused here rather than burning one of the
 * ten attempts an hour the server allows.
 */
export const backupCodeSchema = z.string().superRefine((value, ctx) => {
  const normalised = (value ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  if (normalised.length === 0) {
    ctx.addIssue({ code: 'custom', message: t`Enter a recovery code` })
    return
  }
  if (normalised.length !== 10) {
    ctx.addIssue({ code: 'custom', message: t`A recovery code is 10 characters` })
    return
  }
  // Crockford base32 — I, L, O and U are not in the alphabet the codes are
  // drawn from, so a code containing one was misread off the page.
  if (/[ILOU]/.test(normalised)) {
    ctx.addIssue({
      code: 'custom',
      message: t`That code contains a letter we never use. Check for a mistyped 1 or 0.`,
    })
  }
})

/**
 * Accepted values for profiles.open_to: what is offered today, plus the
 * retired values still stored on live profiles. Without the retired ones, a
 * member who picked "Knowledge Transfer" before could not save any profile
 * edit at all.
 */
export const COLLABORATION_VALUES = [
  ...COLLABORATION_OPTIONS.map((o) => o.value),
  ...Object.keys(COLLABORATION_LEGACY_LABELS),
] as unknown as [string, ...string[]]

const signupFields = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
  confirm_password: z.string().min(1, 'Please confirm your password'),
  // Optional since the field left signup: an account is created from an email
  // address alone, and SignupPage seeds the profile name from its local part.
  // Onboarding and Settings still send one, and it is still length-checked.
  display_name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  role: z.enum(SIGNUP_ROLES, { error: 'Please select a role' }),
  date_of_birth: dateOfBirthSchema,
  organization: z.string().max(200, 'Organisation name too long').optional(),
  industry: z.string().max(100, 'Industry too long').optional(),
  country: z.string().max(100).optional(),
  bio: z.string().max(500, 'Bio too long').optional(),
  skills: z.array(z.string()).max(20, 'Maximum 20 skills').optional(),
  interests: z.array(z.string()).max(20, 'Maximum 20 interests').optional(),
  open_to: z.array(z.enum(COLLABORATION_VALUES)).optional(),
})

/**
 * Confirmation must match. The issue is attached to `confirm_password` so the
 * message renders under the field the user can actually fix, and it stays quiet
 * while that field is still empty — the min(1) check owns that case.
 */
const passwordsMatch = (
  value: { password: string; confirm_password: string },
  ctx: z.RefinementCtx,
) => {
  if (value.confirm_password && value.confirm_password !== value.password) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirm_password'],
      message: t`Passwords do not match`,
    })
  }
}

export const signupSchema = signupFields.superRefine(passwordsMatch)

// Step 1 of the signup wizard (required account fields)
export const signupStep1Schema = signupFields
  .pick({
    email: true,
    password: true,
    confirm_password: true,
    role: true,
    date_of_birth: true,
  })
  .superRefine(passwordsMatch)

// Project Schemas
export const projectSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title too long'),
  description: z.string().max(5000, 'Description too long').optional(),
  category: z.enum([
    'technology',
    'healthcare',
    'education',
    'agriculture',
    'environment',
    'other',
  ]),
  phase: z.enum(['concept', 'prototype', 'funding', 'launch']),
  hashtags: z.array(z.string()).max(10, 'Maximum 10 hashtags allowed'),
  is_public: z.boolean(),
})

// Event Schemas
export const eventSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title too long'),
  description: z.string().max(5000, 'Description too long').optional(),
  event_type: z.enum(['hackathon', 'workshop', 'meetup', 'conference', 'demo_day', 'challenge']),
  location: z.string().max(200, 'Location too long').optional(),
  is_virtual: z.boolean(),
  start_date: z.string().datetime('Invalid date format'),
  end_date: z.string().datetime('Invalid date format').optional(),
  capacity: z.number().int().positive('Capacity must be positive').optional(),
})

// Event Update Schemas
export const eventUpdateSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title too long'),
  content: z.string().min(10, 'Content must be at least 10 characters').max(10000, 'Content too long'),
  update_type: z.enum(['announcement', 'schedule_change', 'reminder']),
  is_published: z.boolean(),
})

// Event Article Schemas
export const eventArticleSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title too long'),
  content: z.string().min(10, 'Content must be at least 10 characters').max(20000, 'Content too long'),
  article_type: z.enum(['recap', 'resources', 'summary', 'blog']),
  is_published: z.boolean(),
})

// Grant Schemas
export const grantSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title too long'),
  description: z.string().max(5000, 'Description too long').optional(),
  amount_min: z.number().positive('Amount must be positive').optional(),
  amount_max: z.number().positive('Amount must be positive').optional(),
  currency: z.string().length(3, 'Currency must be 3-letter code'),
  deadline: z.string().datetime('Invalid date format').optional(),
  eligibility: z.string().max(1000, 'Eligibility text too long').optional(),
  application_url: z.string().url('Invalid URL').optional(),
  grant_type: z.string().max(100).optional(),
})

// Message Schema
export const messageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(2000, 'Message too long'),
})

// Profile Update Schema
export const profileUpdateSchema = z.object({
  display_name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  bio: z.string().max(500, 'Bio too long').optional(),
  country: z.string().max(100).optional(),
  organization: z.string().max(200, 'Organisation name too long').optional(),
  industry: z.string().max(100, 'Industry too long').optional(),
  skills: z.array(z.string()).max(20, 'Maximum 20 skills').optional(),
  interests: z.array(z.string()).max(20, 'Maximum 20 interests').optional(),
  open_to: z.array(z.enum(COLLABORATION_VALUES)).optional(),
  // 082. Length-capped only. No phone pattern: OECS members hold numbers from a
  // dozen national plans plus diaspora numbers, and a regex tight enough to be
  // worth having would reject somebody's real number.
  phone: z.string().max(40, 'Phone number too long').optional(),
  website: z
    .string()
    .max(300)
    .url('Enter a full URL, including https://')
    .or(z.literal(''))
    .optional(),
  languages: z.array(z.string()).max(12, 'Maximum 12 languages').optional(),
})

// Change Password Schema
export const changePasswordSchema = z.object({
  new_password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm_password: z.string().min(6, 'Password must be at least 6 characters'),
}).superRefine((data, ctx) => {
  // superRefine rather than refine: refine's options object is evaluated once
  // at module scope, freezing the message in English; this resolves per parse.
  if (data.new_password !== data.confirm_password) {
    ctx.addIssue({ code: 'custom', path: ['confirm_password'], message: t`Passwords do not match` })
  }
})

// Change Email Schema
export const changeEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
})

// Secondary (alias) Email Schema
export const secondaryEmailSchema = z.object({
  email: z.string().email('Invalid email address').max(254, 'Email too long'),
})

// Forgot Password Schema
export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

// Forum Schemas
export const forumPostSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title too long'),
  content: z.string().min(10, 'Content must be at least 10 characters').max(10000, 'Content too long'),
})

// A board name is a navigation label, not a sentence — the card and the
// breadcrumb both render it on one line.
export const forumBoardSchema = z.object({
  name: z.string().min(3, 'Board name must be at least 3 characters').max(60, 'Board name too long'),
  description: z.string().max(500, 'Description too long').optional().or(z.literal('')),
})

export const forumReplySchema = z.object({
  content: z.string().min(1, 'Reply cannot be empty').max(5000, 'Reply too long'),
})

// Registration Field Schema (for admin form builder)
export const registrationFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, 'Label is required').max(100, 'Label too long'),
  type: z.enum(['text', 'textarea', 'number', 'email', 'select', 'checkbox', 'date']),
  placeholder: z.string().max(200).optional(),
  required: z.boolean().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  helpText: z.string().max(300).optional(),
})

// Event Speaker Schema
export const eventSpeakerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  title: z.string().max(200).optional(),
  bio: z.string().max(2000).optional(),
  photo_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
})

// Schedule Item Schema
export const scheduleItemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().optional(),
  location: z.string().max(200).optional(),
  speaker_id: z.string().uuid().optional().or(z.literal('')),
  schedule_type: z.enum(['session', 'break', 'keynote', 'workshop', 'networking', 'other']),
})

// Grievance Schema
export const grievanceSchema = z.object({
  reported_user_id: z.string().uuid('Invalid user'),
  category: z.enum([
    'soliciting',
    'misrepresentation',
    'ip_infringement',
    'abusive_interactions',
    'harassment',
    'spam_scam',
    'impersonation',
    'hate_speech',
    'privacy_violations',
  ]),
  description: z.string()
    .min(20, 'Description must be at least 20 characters')
    .max(5000, 'Description too long'),
  evidence_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  context: z.string().max(1000, 'Context too long').optional(),
})

export const grievanceUpdateSchema = z.object({
  status: z.enum(['pending', 'under_review', 'resolved', 'dismissed']),
  admin_notes: z.string().max(5000, 'Notes too long').optional(),
})

// Export types
export type LoginInput = z.infer<typeof loginSchema>
export type SignupInput = z.infer<typeof signupSchema>
export type ProjectInput = z.infer<typeof projectSchema>
export type EventInput = z.infer<typeof eventSchema>
export type GrantInput = z.infer<typeof grantSchema>
export type MessageInput = z.infer<typeof messageSchema>
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>
export type ForumPostInput = z.infer<typeof forumPostSchema>
export type ForumBoardInput = z.infer<typeof forumBoardSchema>
export type ForumReplyInput = z.infer<typeof forumReplySchema>
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>
export type EventArticleInput = z.infer<typeof eventArticleSchema>
export type GrievanceInput = z.infer<typeof grievanceSchema>
export type GrievanceUpdateInput = z.infer<typeof grievanceUpdateSchema>
