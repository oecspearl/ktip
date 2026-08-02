/**
 * The emoji a message may carry.
 *
 * WHY A CURATED LIST AND NOT ALL 3,700
 * ------------------------------------
 * A full set means shipping a data file of every emoji and its CLDR keywords in
 * every locale, or fetching one. Nobody has ever needed 🫏 in a hackathon DM.
 * This is the set people actually use, hand-tagged, and it costs a couple of
 * kilobytes.
 *
 * WHY CHARACTERS AND NOT PICTURES
 * -------------------------------
 * A message is text. Whatever goes in the box is stored, sent, and drawn by the
 * *reader's* emoji font — so a picker that showed our own artwork would be
 * promising something the recipient will not see. The venue's reaction bar is
 * the opposite case (a fixed set of six, never stored, never re-rendered
 * anywhere else) which is why that one ships its own art. See
 * src/lib/reaction-emoji.ts.
 *
 * Adding one: put it in the right group with a couple of words somebody would
 * actually type. Order within a group is the order it is offered in.
 */

export interface EmojiEntry {
  /** The character itself. This is what is inserted, stored and sent. */
  e: string
  /** Search terms, lowercase, space separated. The group name is implied. */
  k: string
}

export interface EmojiGroup {
  id: string
  label: string
  /** Shown on the group's tab. A character, so the tabs need no artwork. */
  tab: string
  emoji: EmojiEntry[]
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: 'faces',
    label: 'Smileys',
    tab: '😀',
    emoji: [
      { e: '😀', k: 'grin happy smile' },
      { e: '😄', k: 'happy smile joy' },
      { e: '😁', k: 'grin beam' },
      { e: '😂', k: 'laugh tears joy lol' },
      { e: '🤣', k: 'rofl laugh floor' },
      { e: '🙂', k: 'slight smile' },
      { e: '😉', k: 'wink' },
      { e: '😊', k: 'blush smile happy' },
      { e: '😍', k: 'love heart eyes' },
      { e: '🥰', k: 'love adore hearts' },
      { e: '😘', k: 'kiss' },
      { e: '😎', k: 'cool sunglasses' },
      { e: '🤩', k: 'star struck amazing wow' },
      { e: '🥳', k: 'party celebrate birthday' },
      { e: '🤗', k: 'hug' },
      { e: '🤔', k: 'thinking hmm' },
      { e: '🤨', k: 'raised eyebrow suspicious' },
      { e: '😐', k: 'neutral meh' },
      { e: '🙄', k: 'eye roll' },
      { e: '😴', k: 'sleep tired zzz' },
      { e: '🥹', k: 'holding back tears proud' },
      { e: '😅', k: 'sweat nervous laugh' },
      { e: '😬', k: 'grimace awkward' },
      { e: '🤯', k: 'mind blown exploding head' },
      { e: '😭', k: 'cry sob' },
      { e: '😢', k: 'sad tear' },
      { e: '😤', k: 'determined steam' },
      { e: '😳', k: 'flushed shocked' },
      { e: '🤒', k: 'sick ill' },
      { e: '🤓', k: 'nerd glasses' },
      { e: '🫡', k: 'salute yes sir' },
      { e: '🫠', k: 'melting overwhelmed' },
    ],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    tab: '👍',
    emoji: [
      { e: '👍', k: 'thumbs up yes agree lgtm' },
      { e: '👎', k: 'thumbs down no' },
      { e: '👏', k: 'clap applause well done' },
      { e: '🙌', k: 'raise hands celebrate praise' },
      { e: '🙏', k: 'please thanks pray' },
      { e: '🤝', k: 'handshake deal agree' },
      { e: '👋', k: 'wave hi hello bye' },
      { e: '✌️', k: 'peace victory' },
      { e: '🤞', k: 'fingers crossed luck' },
      { e: '👌', k: 'ok perfect' },
      { e: '🤙', k: 'call me shaka' },
      { e: '💪', k: 'strong muscle' },
      { e: '🫶', k: 'heart hands love' },
      { e: '👀', k: 'eyes looking watching' },
      { e: '🧠', k: 'brain smart idea' },
      { e: '✍️', k: 'writing note' },
    ],
  },
  {
    id: 'hearts',
    label: 'Hearts',
    tab: '❤️',
    emoji: [
      { e: '❤️', k: 'love red heart' },
      { e: '🧡', k: 'orange heart' },
      { e: '💛', k: 'yellow heart' },
      { e: '💚', k: 'green heart' },
      { e: '💙', k: 'blue heart' },
      { e: '💜', k: 'purple heart' },
      { e: '🖤', k: 'black heart' },
      { e: '🤍', k: 'white heart' },
      { e: '💖', k: 'sparkling heart' },
      { e: '💯', k: 'hundred perfect score' },
      { e: '💔', k: 'broken heart' },
      { e: '💫', k: 'dizzy stars' },
    ],
  },
  {
    id: 'celebrate',
    label: 'Celebration',
    tab: '🎉',
    emoji: [
      { e: '🎉', k: 'party popper celebrate congrats' },
      { e: '🎊', k: 'confetti celebrate' },
      { e: '🥂', k: 'cheers toast' },
      { e: '🏆', k: 'trophy win first' },
      { e: '🥇', k: 'gold medal first' },
      { e: '🎯', k: 'target bullseye goal' },
      { e: '🚀', k: 'rocket launch ship fast' },
      { e: '🔥', k: 'fire hot lit' },
      { e: '✨', k: 'sparkles shiny new' },
      { e: '⭐', k: 'star favourite' },
      { e: '🌟', k: 'glowing star' },
      { e: '🎁', k: 'gift present' },
      { e: '🎈', k: 'balloon' },
      { e: '🍾', k: 'champagne pop celebrate' },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    tab: '💻',
    emoji: [
      { e: '💻', k: 'laptop code work' },
      { e: '🖥️', k: 'desktop computer' },
      { e: '📱', k: 'phone mobile' },
      { e: '⌨️', k: 'keyboard typing' },
      { e: '🐛', k: 'bug issue defect' },
      { e: '🛠️', k: 'tools fix build' },
      { e: '⚙️', k: 'settings gear config' },
      { e: '📊', k: 'chart data analytics' },
      { e: '📈', k: 'chart up growth' },
      { e: '📉', k: 'chart down decline' },
      { e: '📝', k: 'memo notes write' },
      { e: '📌', k: 'pin important' },
      { e: '📎', k: 'paperclip attachment' },
      { e: '🗓️', k: 'calendar date schedule' },
      { e: '⏰', k: 'alarm clock time deadline' },
      { e: '⏳', k: 'hourglass waiting time' },
      { e: '📅', k: 'calendar' },
      { e: '🔗', k: 'link url' },
      { e: '💡', k: 'idea lightbulb suggestion' },
      { e: '🔍', k: 'search look find' },
      { e: '🔒', k: 'lock secure private' },
      { e: '🔑', k: 'key access' },
      { e: '📣', k: 'announce megaphone shout' },
      { e: '💰', k: 'money funding budget' },
      { e: '☕', k: 'coffee break' },
      { e: '🧪', k: 'test experiment lab' },
      { e: '🗂️', k: 'files folder organise' },
      { e: '🖇️', k: 'links attach' },
    ],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    tab: '✅',
    emoji: [
      { e: '✅', k: 'check done yes tick complete' },
      { e: '☑️', k: 'checkbox done' },
      { e: '❌', k: 'cross no wrong fail' },
      { e: '⚠️', k: 'warning caution careful' },
      { e: '❓', k: 'question' },
      { e: '❗', k: 'exclamation important' },
      { e: '➕', k: 'plus add' },
      { e: '➖', k: 'minus remove' },
      { e: '🔴', k: 'red circle blocked' },
      { e: '🟡', k: 'yellow circle at risk' },
      { e: '🟢', k: 'green circle on track ok' },
      { e: '🔵', k: 'blue circle' },
      { e: '🆕', k: 'new' },
      { e: '🔝', k: 'top up' },
      { e: '♻️', k: 'recycle refresh retry' },
      { e: '🚧', k: 'construction wip in progress' },
    ],
  },
  {
    id: 'places',
    label: 'World',
    tab: '🌴',
    emoji: [
      { e: '🌴', k: 'palm tree caribbean island' },
      { e: '🏝️', k: 'island beach' },
      { e: '🌊', k: 'wave sea ocean' },
      { e: '☀️', k: 'sun sunny' },
      { e: '🌧️', k: 'rain' },
      { e: '🌈', k: 'rainbow' },
      { e: '🌍', k: 'earth world globe' },
      { e: '🌱', k: 'seedling grow new' },
      { e: '🐢', k: 'turtle slow' },
      { e: '🦜', k: 'parrot bird' },
      { e: '🍍', k: 'pineapple' },
      { e: '🥥', k: 'coconut' },
      { e: '🍕', k: 'pizza food' },
      { e: '🍰', k: 'cake birthday' },
      { e: '🎓', k: 'graduation student school' },
      { e: '⚽', k: 'football soccer' },
    ],
  },
]

/** Everything, flat. Built once — the picker searches this. */
export const ALL_EMOJI: EmojiEntry[] = EMOJI_GROUPS.flatMap((g) => g.emoji)

/**
 * Search by keyword, then by the group's own name.
 *
 * Prefix matches first: typing "th" should offer 🤔 (thinking) before 👍 (…up),
 * which a plain `includes` gets backwards.
 */
export function searchEmoji(query: string, limit = 48): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const starts: EmojiEntry[] = []
  const contains: EmojiEntry[] = []

  for (const group of EMOJI_GROUPS) {
    const groupMatch = group.label.toLowerCase().startsWith(q)
    for (const entry of group.emoji) {
      const words = entry.k.split(' ')
      if (words.some((w) => w.startsWith(q))) starts.push(entry)
      else if (groupMatch || entry.k.includes(q)) contains.push(entry)
    }
  }
  return [...starts, ...contains].slice(0, limit)
}

// ---------------------------------------------------------------------------
// recents
// ---------------------------------------------------------------------------

const RECENT_KEY = 'ktip.emoji.recent'
const MAX_RECENT = 24

/**
 * Kept per device, like every other "how I like my screen" preference here.
 * Junk or a full quota is swallowed: a picker is not worth an error boundary.
 */
export function readRecentEmoji(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const known = new Set(ALL_EMOJI.map((entry) => entry.e))
    return parsed.filter((e): e is string => typeof e === 'string' && known.has(e)).slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function pushRecentEmoji(emoji: string): string[] {
  const next = [emoji, ...readRecentEmoji().filter((e) => e !== emoji)].slice(0, MAX_RECENT)
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Private mode. The list still updates for this session.
  }
  return next
}
