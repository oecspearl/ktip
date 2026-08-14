import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { scanText } from '../../lib/moderation/scan'
import { blocksOn } from '../../lib/moderation/policy'
import type {
  ModerationRule,
  ModerationSurface,
  ScanMatch,
  Severity,
} from '../../lib/moderation/types'

/**
 * The rich-text half of the composer filter.
 *
 * A mirror layer cannot work here — ProseMirror owns the DOM and the text is
 * not a flat string — but it does not need to: ProseMirror has decorations,
 * which is the same idea done properly. The interesting parts are position
 * mapping (see blockText) and keeping the marks glued to their text while the
 * member types somewhere else in the document.
 */

export interface ModerationFlag {
  from: number
  to: number
  severity: Severity
  text: string
}

export interface ModerationHighlightState {
  decorations: DecorationSet
  flags: ModerationFlag[]
}

export const ModerationHighlightKey = new PluginKey<ModerationHighlightState>('moderationHighlight')

export interface ModerationHighlightOptions {
  /**
   * A getter, not an array. The editor is constructed once, while the rules
   * arrive from an RPC a moment later — a captured array would be empty for
   * the life of the editor. Returning the live array also keeps the scanner's
   * matcher cache, which is keyed by array identity, correct.
   */
  getRules: () => ModerationRule[]
  surface: ModerationSurface
  onFlagsChange?: (flags: ModerationFlag[]) => void
}

/** Scan this long after the last change. Matches the plain-text field. */
const RESCAN_DEBOUNCE_MS = 150

/**
 * A textblock's text, aligned to ProseMirror positions.
 *
 * node.textContent is NOT position-aligned: a hardBreak occupies one position
 * and contributes an empty string, so every match after it is off by one, and
 * off by more with each further break. Building the string manually — one
 * character per position — makes `charIndex === pmPos - (blockPos + 1)` hold
 * exactly, which is what makes the decoration land on the right word.
 */
function blockText(node: PMNode): string {
  let out = ''
  node.forEach((child) => {
    if (child.isText) out += child.text ?? ''
    else if (child.type.name === 'hardBreak') out += '\n'
    // Object replacement character: one per position the node occupies, so a
    // following match keeps its offset. It matches no rule by construction.
    else out += '￼'.repeat(child.nodeSize)
  })
  return out
}

function scanDoc(
  doc: PMNode,
  rules: ModerationRule[],
  surface: ModerationSurface
): { decorations: Decoration[]; flags: ModerationFlag[] } {
  const decorations: Decoration[] = []
  const flags: ModerationFlag[] = []
  if (rules.length === 0) return { decorations, flags }

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true

    const text = blockText(node)
    if (text.trim().length === 0) return false

    // Per block, not per document: one scan per text column is what the SQL
    // trigger does, and a match spanning a paragraph boundary would be
    // nonsense anyway.
    const result = scanText(text, rules)
    const base = pos + 1

    for (const match of result.matches as ScanMatch[]) {
      const from = base + match.start
      const to = base + match.end
      decorations.push(
        Decoration.inline(from, to, {
          class: `ktip-flag ktip-flag-${match.severity}`,
          'data-rule': match.ruleId,
        })
      )
      if (match.via === 'raw' && blocksOn(match.category, surface)) {
        flags.push({ from, to, severity: match.severity, text: text.slice(match.start, match.end) })
      }
    }

    return false // textblocks do not nest
  })

  return { decorations, flags }
}

export const ModerationHighlight = Extension.create<ModerationHighlightOptions>({
  name: 'moderationHighlight',

  addOptions() {
    return {
      getRules: () => [] as ModerationRule[],
      surface: 'grant_application' as ModerationSurface,
      onFlagsChange: undefined,
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    let timer: ReturnType<typeof setTimeout> | null = null

    return [
      new Plugin<ModerationHighlightState>({
        key: ModerationHighlightKey,

        state: {
          init(_, { doc }) {
            const { decorations, flags } = scanDoc(doc, options.getRules(), options.surface)
            return { decorations: DecorationSet.create(doc, decorations), flags }
          },

          apply(tr, value, _old, newState) {
            if (tr.getMeta(ModerationHighlightKey)?.rescan) {
              const { decorations, flags } = scanDoc(newState.doc, options.getRules(), options.surface)
              return { decorations: DecorationSet.create(newState.doc, decorations), flags }
            }
            if (!tr.docChanged) return value
            // Map first so existing marks stay attached to their text while
            // the member edits elsewhere; the real rescan follows on the
            // debounce. Without this the marks jump on every keystroke.
            return {
              decorations: value.decorations.map(tr.mapping, tr.doc),
              flags: value.flags.map((f) => ({
                ...f,
                from: tr.mapping.map(f.from),
                to: tr.mapping.map(f.to),
              })),
            }
          },
        },

        view(view) {
          const notify = () => {
            const state = ModerationHighlightKey.getState(view.state)
            options.onFlagsChange?.(state?.flags ?? [])
          }
          notify()
          return {
            update(v, prevState) {
              if (v.state.doc.eq(prevState.doc)) return
              if (timer) clearTimeout(timer)
              timer = setTimeout(() => {
                v.dispatch(v.state.tr.setMeta(ModerationHighlightKey, { rescan: true }))
                options.onFlagsChange?.(ModerationHighlightKey.getState(v.state)?.flags ?? [])
              }, RESCAN_DEBOUNCE_MS)
            },
            destroy() {
              if (timer) clearTimeout(timer)
            },
          }
        },

        props: {
          decorations(state) {
            return ModerationHighlightKey.getState(state)?.decorations
          },

          /**
           * Clicking a mark removes it. Trivial here compared with the plain
           * textarea, because ProseMirror owns positions and the decoration
           * knows where it starts and ends.
           */
          handleClick(view, pos) {
            const set = ModerationHighlightKey.getState(view.state)?.decorations
            if (!set) return false
            const [deco] = set.find(pos, pos)
            if (!deco) return false
            view.dispatch(view.state.tr.delete(deco.from, deco.to))
            return true
          },
        },
      }),
    ]
  },
})

export default ModerationHighlight
