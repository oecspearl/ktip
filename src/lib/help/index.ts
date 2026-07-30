import type { HelpCategory } from './types'
import { GETTING_STARTED_CATEGORY, NAVIGATION_CATEGORY } from './basics'
import { PROJECTS_CATEGORY } from './projects'
import { EVENTS_CATEGORY, HACKATHONS_CATEGORY } from './events'
import { GRANTS_CATEGORY, GRANT_APPLICATIONS_CATEGORY } from './funding'
import { FORUMS_CATEGORY, MESSAGES_CATEGORY, NETWORK_CATEGORY } from './community'
import { COLLABORATION_CATEGORY } from './collaboration'
import {
  ACHIEVEMENTS_CATEGORY,
  CV_CATEGORY,
  DASHBOARD_CATEGORY,
  SETTINGS_CATEGORY,
  VERIFICATION_CATEGORY,
} from './account'
import {
  ADMIN_CATEGORY,
  RESOURCES_CATEGORY,
  SAFETY_CATEGORY,
  TROUBLESHOOTING_CATEGORY,
} from './support'

/**
 * Display order for the Help Center sidebar and card grid: the journey a member
 * actually takes (account → the things they do → their own record → support),
 * with administrator material last.
 *
 * Article ids are the deep-link targets behind /help?article=<id> and are
 * flat-mapped into the global search index by src/lib/site-map.ts, so they must
 * stay globally unique and should not be renamed casually.
 */
export const HELP_CATEGORIES: HelpCategory[] = [
  GETTING_STARTED_CATEGORY,
  NAVIGATION_CATEGORY,
  PROJECTS_CATEGORY,
  EVENTS_CATEGORY,
  HACKATHONS_CATEGORY,
  GRANTS_CATEGORY,
  GRANT_APPLICATIONS_CATEGORY,
  FORUMS_CATEGORY,
  MESSAGES_CATEGORY,
  NETWORK_CATEGORY,
  COLLABORATION_CATEGORY,
  DASHBOARD_CATEGORY,
  ACHIEVEMENTS_CATEGORY,
  CV_CATEGORY,
  SETTINGS_CATEGORY,
  VERIFICATION_CATEGORY,
  SAFETY_CATEGORY,
  RESOURCES_CATEGORY,
  TROUBLESHOOTING_CATEGORY,
  ADMIN_CATEGORY,
]

export { GETTING_STARTED_GUIDES } from './guides'
export type { HelpArticle, HelpCategory, GettingStartedGuide } from './types'
