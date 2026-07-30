import {
  BookOpen,
  Briefcase,
  Calendar,
  Code2,
  GraduationCap,
  Landmark,
  Leaf,
  Handshake,
  HeartPulse,
  Laptop,
  Lightbulb,
  Mic,
  Microscope,
  Rocket,
  Sparkles,
  Sprout,
  Wallet,
  Wrench,
  Globe,
  type LucideIcon,
} from 'lucide-react'

export const PROJECT_CATEGORY_ICONS: Record<string, LucideIcon> = {
  technology: Laptop,
  healthcare: HeartPulse,
  education: GraduationCap,
  agriculture: Sprout,
  environment: Globe,
  other: Sparkles,
}

export const EVENT_TYPE_ICONS: Record<string, LucideIcon> = {
  hackathon: Laptop,
  workshop: Wrench,
  meetup: Handshake,
  conference: Mic,
  demo_day: Rocket,
}

export const GRANT_TYPE_ICONS: Record<string, LucideIcon> = {
  startup: Rocket,
  research: Microscope,
  innovation: Lightbulb,
  development: Wrench,
  education: BookOpen,
}

export const RESOURCE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  technology: Laptop,
  healthcare: HeartPulse,
  education: GraduationCap,
  agriculture: Sprout,
  environment: Globe,
  climate_action: Leaf,
  business: Briefcase,
  other: Sparkles,
}

export const INTEGRATION_CATEGORY_ICONS: Record<string, LucideIcon> = {
  funding: Wallet,
  productivity: Wrench,
  government: Landmark,
  education: GraduationCap,
  developer: Code2,
  other: Sparkles,
}

export const projectCategoryIcon = (category: string | null | undefined): LucideIcon =>
  (category && PROJECT_CATEGORY_ICONS[category]) || Sparkles

export const eventTypeIcon = (type: string | null | undefined): LucideIcon =>
  (type && EVENT_TYPE_ICONS[type]) || Calendar

export const grantTypeIcon = (type: string | null | undefined): LucideIcon =>
  (type && GRANT_TYPE_ICONS[type]) || Wallet

export const resourceCategoryIcon = (category: string | null | undefined): LucideIcon =>
  (category && RESOURCE_CATEGORY_ICONS[category]) || BookOpen

export const integrationCategoryIcon = (category: string | null | undefined): LucideIcon =>
  (category && INTEGRATION_CATEGORY_ICONS[category]) || Sparkles
