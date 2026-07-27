import { z } from 'zod'

// User Authentication Schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  display_name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['student', 'mentor', 'investor', 'entrepreneur', 'private_sector']),
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
  event_type: z.enum(['hackathon', 'workshop', 'meetup', 'conference', 'demo_day']),
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
