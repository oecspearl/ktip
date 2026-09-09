export const FALLBACK_IMAGE = '/ktiphero.webp'

/**
 * The platform's own photography, from the OECS SKIP sessions, grouped by what
 * is happening in the frame rather than by which page first needed it.
 *
 * Grouping by moment is what makes rotation possible. The old set was one stock
 * photo per slot, so every Events page in the product showed the same picture
 * forever. Here a page asks for a *kind* of photo and gets a stable pick from
 * that group, so two event pages differ while both still look like an event.
 *
 * Order inside a set decides what a given page shows on day zero and which
 * frame it moves to next; every frame in a set comes up eventually, so put the
 * strongest one first and the set will lead with it.
 */
export const PHOTO_SETS = {
  /** A speaker at the lectern under the SKIP banner. Formal, institutional. */
  keynote: [
    '/photos/keynote-1.webp',
    '/photos/keynote-2.webp',
    '/photos/keynote-3.webp',
    '/photos/keynote-4.webp',
    '/photos/keynote-5.webp',
    '/photos/keynote-6.webp',
  ],
  /** Mic in the room — questions, panels, someone making a point. */
  discussion: [
    '/photos/discussion-1.webp',
    '/photos/discussion-2.webp',
    '/photos/discussion-3.webp',
    '/photos/discussion-4.webp',
    '/photos/discussion-5.webp',
  ],
  /** The room working: full tables, laptops open, several conversations at once. */
  workshop: [
    '/photos/workshop-1.webp',
    '/photos/workshop-2.webp',
    '/photos/workshop-3.webp',
    '/photos/workshop-4.webp',
    '/photos/workshop-5.webp',
    '/photos/workshop-6.webp',
  ],
  /** Two or three heads at one screen. Building something together, up close. */
  pairing: [
    '/photos/pairing-1.webp',
    '/photos/pairing-2.webp',
    '/photos/pairing-3.webp',
    '/photos/pairing-4.webp',
    '/photos/pairing-5.webp',
    '/photos/pairing-6.webp',
  ],
  /** One person, heads down, and the desk itself. Quiet, individual work. */
  focus: [
    '/photos/focus-1.webp',
    '/photos/focus-2.webp',
    '/photos/focus-3.webp',
    '/photos/focus-4.webp',
  ],
  /** Everyone together in front of the banner, plus the moment it landed. */
  cohort: [
    '/photos/cohort-1.webp',
    '/photos/cohort-2.webp',
    '/photos/cohort-3.webp',
    '/photos/cohort-4.webp',
    '/photos/cohort-5.webp',
    '/photos/cohort-6.webp',
    '/photos/cohort-7.webp',
  ],
} as const

/**
 * Where the faces are, as the Y half of an `object-position`.
 *
 * A page band is about 5.5:1 and the photos are 3:2, so a band shows roughly a
 * quarter of the frame — centred, that quarter is everybody's chest. Every
 * photo therefore carries its own focal point instead of relying on the
 * `50% 50%` default, which beheaded half the set.
 *
 * Seeded from sharp's attention crop and then corrected by eye: saliency reads
 * a lit laptop screen or a printed banner as the subject about a third of the
 * time, and those were exactly the frames it put a torso in.
 */
const PHOTO_FOCUS: Record<string, number> = {
  'cohort-1': 34, 'cohort-2': 34, 'cohort-3': 31, 'cohort-4': 32,
  'cohort-5': 35, 'cohort-6': 48, 'cohort-7': 25,
  'discussion-1': 35, 'discussion-2': 40, 'discussion-3': 66,
  'discussion-4': 45, 'discussion-5': 50,
  'focus-1': 38, 'focus-2': 69, 'focus-3': 35, 'focus-4': 63,
  'keynote-1': 30, 'keynote-2': 38, 'keynote-3': 35,
  'keynote-4': 75, 'keynote-5': 69, 'keynote-6': 25,
  'pairing-1': 45, 'pairing-2': 34, 'pairing-3': 44,
  'pairing-4': 41, 'pairing-5': 69, 'pairing-6': 41,
  'workshop-1': 44, 'workshop-2': 34, 'workshop-3': 45,
  'workshop-4': 66, 'workshop-5': 50, 'workshop-6': 48,
}

/**
 * `object-position` for one of our photos, or undefined for anything else —
 * a member's own upload has its own drag-set focal point and must not be
 * overridden by ours.
 */
export const focalFor = (src?: string | null): string | undefined => {
  if (!src?.startsWith('/photos/')) return undefined
  const name = src.slice('/photos/'.length).replace(/\.[^.]+$/, '')
  const y = PHOTO_FOCUS[name]
  return y === undefined ? undefined : `50% ${y}%`
}

// Pool of hero images assigned to items that have no image of their own — every
// photo we have, so a wall of cards stays varied. The pick is a stable hash of
// the seed, so a card keeps its image across every render of a session rather
// than reshuffling on each one; see ROTATION for how it moves between sessions.
export const HERO_IMAGES = [
  ...PHOTO_SETS.cohort,
  ...PHOTO_SETS.workshop,
  ...PHOTO_SETS.keynote,
  ...PHOTO_SETS.pairing,
  ...PHOTO_SETS.discussion,
  ...PHOTO_SETS.focus,
]

const hash = (seed: string) => {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

/**
 * Avalanche, so that `% pool.length` sees all of the hash rather than its
 * bottom bits.
 *
 * `hash` is `h * 31 + c`, and 31 ≡ 1 (mod 5) and (mod 6) — which are exactly
 * the sizes these sets come in. Taken mod 6 that recurrence collapses to the
 * sum of the seed's character codes, so Business and Chamber landed on the same
 * keynote frame not by chance but because their names happen to sum alike. The
 * mixer (Murmur3's finalizer, with the constants from the `lowbias32` search)
 * makes every output bit depend on every input bit.
 *
 * `hash` itself is left alone: banner.ts keeps a copy of it deliberately, and
 * gradientFor picks from four washes where 31 ≡ 3 (mod 4) already spreads.
 */
const mix = (h: number) => {
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * How long a photo stays put before every pool advances by one.
 *
 * A day. Short enough that someone who checks in most days sees the place move,
 * long enough that a single visit is one consistent set of photography rather
 * than a slideshow. UTC days, not local ones: the turn should happen at one
 * moment everywhere instead of rolling around the map.
 */
const ROTATION_MS = 24 * 60 * 60 * 1000

/** Whole rotation periods since the epoch. Exported so the tests can move time. */
export const epochAt = (now: number) => Math.floor(now / ROTATION_MS)

/**
 * The rotation the whole page shares, read once when this module loads.
 *
 * Frozen for the life of the document on purpose. Reading the clock inside the
 * pick would let a photo change under a reader mid-session — React re-renders
 * a hero on every route change, and a band that swapped photos while someone
 * was looking at it would read as a glitch, not as freshness. Sampling once
 * means a photo can only change across a reload, after the day has turned.
 *
 * It is added to every pick, so it shifts the whole assignment by one step
 * rather than reshuffling it: a grid of cards stays as varied as it was, two
 * landing pages that differed still differ, and each just moves along one.
 */
const ROTATION = epochAt(Date.now())

/**
 * Stable pick from a pool — within one rotation, the same seed always lands on
 * the same photo.
 *
 * `start` is where a seed of `''` lands, so a caller that has a reserved frame
 * and nothing to rotate on gets exactly that frame (mix(hash('')) is 0).
 */
const pick = (pool: readonly string[], seed: string, start = 0) =>
  pool[(mix(hash(seed)) + start + ROTATION) % pool.length]

// Topical photo sets, matched on the page's seed (imageSeed, else the eyebrow)
// so a page band shows something to do with the page instead of a random beach.
// Each entry is a set, not a single file: two pages that match the same rule
// still get different photos of the same kind of moment.
// Most specific patterns first — the first match wins.
export const PAGE_HERO_IMAGES = {
  projects: PHOTO_SETS.workshop,
  events: PHOTO_SETS.keynote,
  eventDetail: PHOTO_SETS.cohort,
  forums: PHOTO_SETS.discussion,
  community: PHOTO_SETS.cohort,
  directory: PHOTO_SETS.cohort,
  resources: PHOTO_SETS.workshop,
  collaborate: PHOTO_SETS.workshop,
  documents: PHOTO_SETS.focus,
  code: PHOTO_SETS.pairing,
  video: PHOTO_SETS.discussion,
  whiteboards: PHOTO_SETS.workshop,
  hackathon: PHOTO_SETS.workshop,
  help: PHOTO_SETS.discussion,
  admin: PHOTO_SETS.keynote,
  analytics: PHOTO_SETS.focus,
  applications: PHOTO_SETS.pairing,
  institutions: PHOTO_SETS.keynote,
  office: PHOTO_SETS.cohort,
  integrations: PHOTO_SETS.pairing,
  api: PHOTO_SETS.pairing,
  security: PHOTO_SETS.keynote,
  network: PHOTO_SETS.cohort,
  settings: PHOTO_SETS.pairing,
  notFound: PHOTO_SETS.focus,
  chamber: PHOTO_SETS.keynote,
  meeting: PHOTO_SETS.discussion,
  dev: PHOTO_SETS.workshop,
} as const

// Domain nouns run before the generic admin/community catch-alls so
// "Event Management" lands on an events photo, not the admin dashboard one.
const TOPIC_RULES: Array<[RegExp, readonly string[]]> = [
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

/** The matched set plus the index of the rule that matched, used as its offset. */
/**
 * Where each rule's own landing page starts in its set: rules are numbered
 * within the set they share, so Institutions, Chamber, Events, Admin and
 * Security sit on five different keynote photos rather than drawing from the
 * same six at random — and stay five apart as the rotation carries them along.
 *
 * Reserved rather than hashed because hashing cannot do this. Twenty-nine
 * landing pages drawing from sets of four to seven is a birthday problem — every
 * mixer tried put four of them on one frame, which is what you would expect
 * from a fair coin and not what anyone wants on a nav bar.
 *
 * A rule added to a set that is already full wraps and starts sharing. That is
 * the signal to add a photo to that set, and the hero-images test asserts each
 * set still has room.
 */
const TOPIC_SLOT: number[] = (() => {
  const taken = new Map<readonly string[], number>()
  return TOPIC_RULES.map(([, set]) => {
    const n = taken.get(set) ?? 0
    taken.set(set, n + 1)
    return n % set.length
  })
})()

export const heroImageFor = (seed: string) => pick(HERO_IMAGES, seed)

/** Hero for a page band: a stable pick from the photo set for the first seed
 *  that names a known topic (imageSeed, then the eyebrow), else a stable pick
 *  from the generic pool. The set is chosen by topic and the frame within it by
 *  the full seed, so every meeting page looks like a meeting and no two look
 *  like the same one. Cards keep using `heroImageFor` so a list of project
 *  cards stays varied. */
export const pageHeroFor = (...seeds: Array<string | null | undefined>) => {
  const present = seeds.filter(Boolean) as string[]
  for (let i = 0; i < present.length; i++) {
    const at = TOPIC_RULES.findIndex(([re]) => re.test(present[i].toLowerCase()))
    if (at === -1) continue
    // The seed that matched names the topic; the seeds it had to skip name the
    // thing. A landing page says its own topic first ("projects") and skips
    // nothing, so it sits on the frame reserved for that rule. A project page
    // leads with an opaque id, matches on its eyebrow instead, and is placed by
    // that id — so it looks like a project without looking like the Projects
    // page, or like the project beside it.
    const entity = present.slice(0, i).join('|')
    return pick(TOPIC_RULES[at][1], entity, TOPIC_SLOT[at])
  }
  return heroImageFor(present[0] ?? 'ktip')
}

// Grants have no image column of their own, so they draw from the same
// photography as everything else, narrowed by grant_type (and by the climate
// flag, which wins) so a startup fund and a research fellowship do not sit on
// the same frame in a carousel.
export const GRANT_IMAGES = HERO_IMAGES

// Four to six deep per type, not two: a two-image pool puts a pair of same-type
// grants on the same photo roughly half the time, which is visible the moment
// two of them sit side by side in a carousel.
const GRANT_TYPE_IMAGES: Record<string, readonly string[]> = {
  startup: [...PHOTO_SETS.pairing, ...PHOTO_SETS.cohort.slice(0, 2)],
  research: [...PHOTO_SETS.focus, ...PHOTO_SETS.pairing.slice(0, 2)],
  innovation: [...PHOTO_SETS.workshop, ...PHOTO_SETS.discussion.slice(0, 2)],
  development: [...PHOTO_SETS.cohort, ...PHOTO_SETS.workshop.slice(0, 2)],
  education: [...PHOTO_SETS.keynote, ...PHOTO_SETS.discussion.slice(0, 2)],
}

// No climate-specific photography in the set, so a climate grant gets the
// widest, most outward-looking frames we have — the full cohort and the room at
// work — rather than a close-up of one laptop.
const CLIMATE_GRANT_IMAGES = [...PHOTO_SETS.cohort, ...PHOTO_SETS.workshop]

export const grantImageFor = (
  seed: string,
  grantType?: string | null,
  isClimateAction?: boolean | null,
) => {
  const pool = isClimateAction
    ? CLIMATE_GRANT_IMAGES
    : (grantType && GRANT_TYPE_IMAGES[grantType]) || GRANT_IMAGES
  return pick(pool, seed)
}

// Brand color washes over card/hero photos. OECS branding runs navy in light
// mode and green in dark, so each wash ships both halves and the `dark:`
// variant takes over at night. Picked by the same stable hash as the image, so
// a card keeps its wash across renders — but deliberately without the rotation
// term, because a wash belongs to the card and the photo only visits it. The
// four are brand colors that sit over any of the photography equally.
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
// so the brighter photos still read through it. This wash stacks with other
// overlays wherever it is used, and opacities multiply, so it is deliberately
// well under half: at /70 the Discover hero was passing 11% of its photography.
export const HERO_WASH =
  'from-[#041E42]/45 via-[#041E42]/15 to-transparent dark:from-[#06210A]/50 dark:via-[#123D08]/18 dark:to-transparent'
