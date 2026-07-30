export const FALLBACK_IMAGE = '/ktiphero.png'

// Pool of stock hero images assigned to items that have no image of their own.
// The pick is a stable hash of the seed so each page/card keeps its image
// across renders instead of reshuffling.
export const HERO_IMAGES = [
  '/hero/hero-1.jpg',
  '/hero/hero-2.jpg',
  '/hero/hero-3.jpg',
  '/hero/hero-4.jpg',
  '/hero/hero-5.jpg',
  '/hero/hero-6.jpg',
]

const hash = (seed: string) => {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

// Topical hero photos, matched on the page's seed (imageSeed, else the eyebrow)
// so a page band shows something to do with the page instead of a random beach.
// Most specific patterns first — the first match wins.
export const PAGE_HERO_IMAGES = {
  projects: '/pages/page-projects.jpg',
  events: '/pages/page-events.jpg',
  eventDetail: '/pages/page-event-detail.jpg',
  forums: '/pages/page-forums.jpg',
  community: '/pages/page-community.jpg',
  directory: '/pages/page-directory.jpg',
  resources: '/pages/page-resources.jpg',
  collaborate: '/pages/page-collaborate.jpg',
  documents: '/pages/page-documents.jpg',
  code: '/pages/page-code.jpg',
  video: '/pages/page-video.jpg',
  whiteboards: '/pages/page-whiteboards.jpg',
  hackathon: '/pages/page-hackathon.jpg',
  help: '/pages/page-help.jpg',
  admin: '/pages/page-admin.jpg',
  analytics: '/pages/page-analytics.jpg',
  applications: '/pages/page-applications.jpg',
  institutions: '/pages/page-institutions.jpg',
  office: '/pages/page-office.jpg',
  integrations: '/pages/page-integrations.jpg',
  api: '/pages/page-api.jpg',
  security: '/pages/page-security.jpg',
  network: '/pages/page-network.jpg',
  settings: '/pages/page-settings.jpg',
  notFound: '/pages/page-404.jpg',
  chamber: '/pages/page-chamber.jpg',
  meeting: '/pages/page-meeting.jpg',
  dev: '/pages/page-dev.jpg',
} as const

// Domain nouns run before the generic admin/community catch-alls so
// "Event Management" lands on an events photo, not the admin dashboard one.
const TOPIC_RULES: Array<[RegExp, string]> = [
  [/404|not.?found|error/, PAGE_HERO_IMAGES.notFound],
  [/hackathon|climathon|sprint|build.?weekend/, PAGE_HERO_IMAGES.hackathon],
  [/whiteboard|canvas|diagram/, PAGE_HERO_IMAGES.whiteboards],
  [/snippet|\bcode\b|editor|learnboard|prose/, PAGE_HERO_IMAGES.code],
  [/video|conference.?room|\bcall\b|\bmeet\b|huddle/, PAGE_HERO_IMAGES.video],
  [/document|\bdocs?\b|\bwrite\b|\bnotes?\b/, PAGE_HERO_IMAGES.documents],
  [/collaborat|workspace|\btools?\b/, PAGE_HERO_IMAGES.collaborate],
  [/partner.?api|\bapi\b|webhook|developer|\bsdk\b/, PAGE_HERO_IMAGES.api],
  [/integration|connector/, PAGE_HERO_IMAGES.integrations],
  [/analytic|report|metric|statistic|insight/, PAGE_HERO_IMAGES.analytics],
  [
    /moderation|grievance|safety|abuse|verification|verify|\brole|permission|security|audit|\buat\b/,
    PAGE_HERO_IMAGES.security,
  ],
  [/application|submission|receipt|proposal|grant|funding/, PAGE_HERO_IMAGES.applications],
  [/institution|university|school|campus|education/, PAGE_HERO_IMAGES.institutions],
  [
    /chamber|private sector|\bsme\b|business|employer|company|organisation|organization/,
    PAGE_HERO_IMAGES.chamber,
  ],
  [/invit|\bjoin\b|network|connection|partnership|referral/, PAGE_HERO_IMAGES.network],
  [/forum|\bboards?\b|\bposts?\b|discussion|thread|topic/, PAGE_HERO_IMAGES.forums],
  [/directory|member|people|talent|profile/, PAGE_HERO_IMAGES.directory],
  [/resource|knowledge|library|guide|learn|faq|training/, PAGE_HERO_IMAGES.resources],
  [/help|support|contact/, PAGE_HERO_IMAGES.help],
  [/event/, PAGE_HERO_IMAGES.events],
  [/project|venture|\bidea|innovation/, PAGE_HERO_IMAGES.projects],
  [/setting|account|preference|notification/, PAGE_HERO_IMAGES.settings],
  [/meeting|agenda|minutes/, PAGE_HERO_IMAGES.meeting],
  [/admin|management|governance|platform|moderator|\busers?\b/, PAGE_HERO_IMAGES.admin],
  [/community|\bhub\b|dashboard|\bfeed\b|discover|home/, PAGE_HERO_IMAGES.community],
  [/\bdev\b|engineering|build/, PAGE_HERO_IMAGES.dev],
  [/office|feedback|\bteam\b/, PAGE_HERO_IMAGES.office],
]

const topicHero = (seed: string) => {
  const s = seed.toLowerCase()
  return TOPIC_RULES.find(([re]) => re.test(s))?.[1]
}

export const heroImageFor = (seed: string) => HERO_IMAGES[hash(seed) % HERO_IMAGES.length]

/** Hero for a page band: the topical photo for the first seed that names a known
 *  topic (imageSeed, then the eyebrow), else a stable pick from the generic pool.
 *  Cards keep using `heroImageFor` so a list of project cards stays varied. */
export const pageHeroFor = (...seeds: Array<string | null | undefined>) => {
  for (const seed of seeds) {
    if (!seed) continue
    const topical = topicHero(seed)
    if (topical) return topical
  }
  return heroImageFor(seeds.find(Boolean) ?? 'ktip')
}

// Grants have no image column of their own, so they draw from a dedicated pool
// of bright, funding-themed shots instead of the generic hero pool. The pick is
// narrowed by grant_type (and by the climate flag, which wins) so a marine
// research fellowship never lands on an office photo.
export const GRANT_IMAGES = [
  '/grants/grant-startup.jpg',
  '/grants/grant-research.jpg',
  '/grants/grant-development.jpg',
  '/grants/grant-education.jpg',
  '/grants/grant-climate.jpg',
  '/grants/grant-marine.jpg',
  '/grants/grant-nature.jpg',
  '/grants/grant-pitch.jpg',
]

const GRANT_TYPE_IMAGES: Record<string, string[]> = {
  startup: ['/grants/grant-startup.jpg', '/grants/grant-pitch.jpg'],
  research: ['/grants/grant-research.jpg', '/grants/grant-marine.jpg'],
  innovation: ['/grants/grant-climate.jpg', '/grants/grant-startup.jpg'],
  development: ['/grants/grant-development.jpg', '/grants/grant-nature.jpg'],
  education: ['/grants/grant-education.jpg', '/grants/grant-pitch.jpg'],
}

const CLIMATE_GRANT_IMAGES = [
  '/grants/grant-climate.jpg',
  '/grants/grant-marine.jpg',
  '/grants/grant-nature.jpg',
  '/grants/grant-research.jpg',
]

export const grantImageFor = (
  seed: string,
  grantType?: string | null,
  isClimateAction?: boolean | null,
) => {
  const pool = isClimateAction
    ? CLIMATE_GRANT_IMAGES
    : (grantType && GRANT_TYPE_IMAGES[grantType]) || GRANT_IMAGES
  return pool[hash(seed) % pool.length]
}

// Brand color washes over card/hero photos. OECS branding runs navy in light
// mode and green in dark, so each wash ships both halves and the `dark:`
// variant takes over at night. Picked by the same stable hash as the image so a
// card keeps its wash across renders.
// Deep greens (not mid-greens) at night: a light green over a bright photo goes
// olive, so the dark ramp stays near-black and only the far end carries brand
// green.
export const BENTO_GRADIENTS = [
  'from-[#041E42]/90 via-[#163A63]/60 to-[#2A5788]/15 dark:from-[#06210A]/92 dark:via-[#123D08]/62 dark:to-[#97D700]/18',
  'from-[#020F21]/90 via-[#041E42]/60 to-[#4F7AAE]/15 dark:from-[#03170A]/92 dark:via-[#16330A]/62 dark:to-[#AEE12B]/18',
  'from-[#0A2B57]/90 via-[#1E4B7E]/60 to-[#6C97C7]/15 dark:from-[#08240C]/92 dark:via-[#1B4409]/62 dark:to-[#7AB000]/18',
  'from-[#163A63]/90 via-[#2A5788]/60 to-[#8FB4DC]/15 dark:from-[#0A2A0D]/92 dark:via-[#20500B]/62 dark:to-[#C6EC5F]/18',
]

export const gradientFor = (seed: string) => BENTO_GRADIENTS[hash(seed) % BENTO_GRADIENTS.length]

// Full-bleed hero wash — same navy-by-day / green-by-night rule, tuned lighter
// so the brighter photos still read through it.
export const HERO_WASH =
  'from-[#041E42]/70 via-[#041E42]/25 to-transparent dark:from-[#06210A]/75 dark:via-[#123D08]/28 dark:to-transparent'
