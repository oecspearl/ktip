import { z } from 'zod'

// User Authentication Schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

// Password requirements drive both the signup schema and the live
// checklist UI, so they can never drift apart.
export const PASSWORD_REQUIREMENTS: { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'number', label: 'At least one number', test: (pw) => /\d/.test(pw) },
  { id: 'symbol', label: 'At least one symbol (e.g. !@#$%)', test: (pw) => /[^a-zA-Z0-9\s]/.test(pw) },
  { id: 'case', label: 'Upper and lowercase letters', test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
]

const passwordSchema = z.string().superRefine((pw, ctx) => {
  for (const req of PASSWORD_REQUIREMENTS) {
    if (!req.test(pw)) {
      ctx.addIssue({ code: 'custom', message: `Password needs: ${req.label.toLowerCase()}` })
      return
    }
  }
})

export const SIGNUP_ROLES = ['student', 'mentor', 'investor', 'entrepreneur', 'private_sector', 'faculty'] as const

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
    const parsed = parseDobInput(value)
    if (!parsed) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid date of birth' })
      return
    }
    if (parsed.getTime() > Date.now()) {
      ctx.addIssue({ code: 'custom', message: 'Date of birth cannot be in the future' })
      return
    }
    const age = ageOn(parsed)
    if (age < MINIMUM_SIGNUP_AGE) {
      ctx.addIssue({
        code: 'custom',
        message: `You must be at least ${MINIMUM_SIGNUP_AGE} to use KTIP`,
      })
      return
    }
    if (age > 120) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid date of birth' })
    }
  })
export const COLLABORATION_VALUES = [
  'research_co_investigation',
  'knowledge_transfer',
  'curriculum_advisory',
  'consultancy',
  'not_seeking',
] as const

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
  display_name: z.string().min(2, 'Name must be at least 2 characters'),
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

// Step 1 of the signup wizard (required account fields)
export const signupStep1Schema = signupSchema.pick({
  email: true,
  password: true,
  display_name: true,
  role: true,
  date_of_birth: true,
})

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
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
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
export type ForumReplyInput = z.infer<typeof forumReplySchema>
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>
export type EventArticleInput = z.infer<typeof eventArticleSchema>
export type GrievanceInput = z.infer<typeof grievanceSchema>
export type GrievanceUpdateInput = z.infer<typeof grievanceUpdateSchema>
