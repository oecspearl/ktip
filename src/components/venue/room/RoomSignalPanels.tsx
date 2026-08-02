import { Hand } from 'lucide-react'
import { ROOM_REACTIONS, type useRoomSignals } from '../../../hooks/useRoomSignals'
import { REACTION_ART, reactionArt } from '../../../lib/reaction-emoji'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import { RoomPanel, RoomPanelEmpty } from './RoomPanel'

type Signals = ReturnType<typeof useRoomSignals>

/**
 * Applause.
 *
 * Everything here is ephemeral by design — see the note in useRoomSignals. The
 * emoji drift up out of the strip and are gone in four seconds; nothing is
 * written down, so nothing has to be cleaned up or moderated after the fact.
 *
 * Drawn from a shipped set rather than left to the reader's emoji font — see
 * src/lib/reaction-emoji.ts. The character still travels on the wire; only the
 * picture is ours.
 *
 * The buttons stay enabled while the channel is down. A reaction that goes
 * nowhere is a smaller disappointment than a row of dead buttons, and the
 * channel usually comes back within a second.
 */
export function ReactionsBar({ signals }: { signals: Signals }) {
  return (
    <div className="relative flex items-center gap-1.5 overflow-hidden rounded-2xl border border-ktip-sand-100 bg-ktip-cream px-3 py-2">
      {ROOM_REACTIONS.map((emoji) => {
        const art = REACTION_ART[emoji]
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => signals.react(emoji)}
            aria-label={art.label}
            title={art.label}
            className="rounded-lg px-1.5 py-1 leading-none transition-transform duration-150 ease-out hover:scale-125 hover:bg-ktip-sand-50 active:scale-95"
          >
            <img
              src={art.src}
              alt=""
              width={26}
              height={26}
              draggable={false}
              className="h-[26px] w-[26px] select-none"
            />
          </button>
        )
      })}

      <span className="ml-auto text-[11px] text-ktip-sand-400">
        {signals.connected ? 'Everyone here sees these' : 'Reconnecting…'}
      </span>

      {/* The drift. pointer-events-none so a burst of applause never eats a
          click meant for the button underneath it. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {signals.reactions.map((r) => {
          const art = reactionArt(r.emoji)
          return (
            <span
              key={r.id}
              className="absolute bottom-0 animate-float-up text-xl leading-none"
              style={{ left: `${8 + r.offset * 78}%` }}
            >
              {/* The character is the fallback, not the plan: a reaction from a
                  newer build carrying an emoji this one has no picture for
                  still floats, in whatever font the reader has. */}
              {art ? (
                <img src={art.src} alt="" width={24} height={24} className="h-6 w-6" />
              ) : (
                r.emoji
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Who wants to speak, in the order they asked.
 *
 * Useful before there is any audio to grant: a moderated room still has a host
 * reading names out, and "three people are waiting" is the thing they cannot
 * otherwise see. A hand drops itself after five minutes so a closed tab does
 * not hold the top of the queue for ever.
 */
export function HandQueuePanel({ signals }: { signals: Signals }) {
  return (
    <RoomPanel title="Hands up" meta={signals.hands.length || undefined}>
      <div className="p-3">
        <button
          type="button"
          onClick={() => signals.setHand(!signals.myHandUp)}
          aria-pressed={signals.myHandUp}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
            signals.myHandUp
              ? 'border-ktip-sun-300 bg-ktip-sun-50 text-ktip-sun-800'
              : 'border-ktip-sand-200 text-ktip-sand-700 hover:border-ktip-ocean-300 hover:text-ktip-ocean-700'
          }`}
        >
          <Hand size={15} aria-hidden="true" />
          {signals.myHandUp ? 'Lower my hand' : 'Raise my hand'}
        </button>
      </div>

      {signals.hands.length === 0 ? (
        <RoomPanelEmpty>Nobody is waiting to speak.</RoomPanelEmpty>
      ) : (
        <ol className="divide-y divide-ktip-sand-100 border-t border-ktip-sand-100">
          {signals.hands.map((hand, i) => (
            <li key={hand.userId} className="flex items-center gap-3 px-4 py-2">
              <span className="w-4 shrink-0 font-mono text-xs text-ktip-sand-400">{i + 1}</span>
              <DiamondAvatar src={hand.avatarUrl} name={hand.name} size={26} />
              <span className="min-w-0 flex-1 truncate text-sm text-ktip-sand-800">{hand.name}</span>
            </li>
          ))}
        </ol>
      )}
    </RoomPanel>
  )
}
