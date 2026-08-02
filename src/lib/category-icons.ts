import {
  BookOpen,
  Briefcase,
  Calendar,
  Code2,
  DoorOpen,
  Gavel,
  GraduationCap,
  Landmark,
  Leaf,
  LifeBuoy,
  Handshake,
  HeartPulse,
  Laptop,
  Lightbulb,
  Mic,
  Microscope,
  Presentation,
  Rocket,
  Sparkles,
  Sprout,
  Store,
  Target,
  Users,
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
  challenge: Target,
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

/**
 * A glyph per venue room kind (089). Same vocabulary as
 * VENUE_ROOM_KIND_LABELS in constants.ts — a room's icon is the fastest way to
 * pick it out of a list, and a colour swatch on its own only helps someone who
 * already knows what the colours mean.
 */
export const VENUE_ROOM_ICONS: Record<string, LucideIcon> = {
  main_hall: Landmark,
  networking: Users,
  workshop: Wrench,
  help_desk: LifeBuoy,
  sponsor_booth: Store,
  team: Rocket,
  judging: Gavel,
  stage: Presentation,
  breakout: DoorOpen,
}

export const venueRoomIcon = (kind: string | null | undefined): LucideIcon =>
  (kind && VENUE_ROOM_ICONS[kind]) || DoorOpen

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
