import type { TutorialStep } from '../../components/tutorial/types'
import { replayStep } from './shared'

/**
 * Tours for the four collaboration tools and their list pages.
 *
 * The editor tours target anchors on ToolPanelShell — `tool-nav`,
 * `tool-actions`, `tool-panel` — which every tool renders through, so none of
 * them needed markup of its own.
 */

/** One tour, three routes: whiteboards, documents and snippets list identically. */
export const collabListTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="collab-list-actions"]',
    title: 'Your work in this tool',
    description:
      'Search what you already have, or start something new with the button on the right.\n\nEverything is saved to your account, so you can close the tab and pick it up from another machine.',
    position: 'bottom',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="collab-list-actions"]',
    title: 'Yours, and everyone else’s',
    description:
      'The first list is what you created — hover a row for the delete control.\n\nUnderneath, Shared with me holds anything someone else gave you access to. Whether you can edit or only read is set by whoever shared it, and it is shown on the item itself once you open it.',
    position: 'bottom',
  },
  replayStep,
]

export const whiteboardTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="tool-panel"]',
    title: 'An infinite canvas',
    description:
      'Draw, write, drop in shapes and arrows, move the camera anywhere. The toolbar across the top is the whole instrument set.\n\nWork saves itself as you go — the status bar at the bottom of the panel tells you when it last did, so there is no document to lose by closing the tab.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="tool-actions"]',
    title: 'Save, export, share',
    description:
      'Save forces a save immediately rather than waiting for the autosave. Export takes the board out as an image or as JSON you can re-import.\n\nShare is the one that matters for collaboration: pick who gets access and whether they can edit or only look. Several people can draw on the same board at once.',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="tool-nav"]',
    title: 'The other tools',
    description:
      'This row is on every collaboration tool — whiteboards, documents, code and video — so moving between them never means going back to the hub first.\n\nCollaborate Hub on the left does go back, when that is what you want.',
    position: 'bottom',
    scrollMode: 'top',
  },
  replayStep,
]

export const documentTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="tool-panel"]',
    title: 'A shared document',
    description:
      'Rich text with the usual formatting — headings, lists, links, images, tables — on a toolbar across the top.\n\nSeveral people can type in it at once and you will see their changes as they make them. Everything autosaves; the status bar says when it last did.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="tool-actions"]',
    title: 'Save, export, share',
    description:
      'Share decides who can open the document and whether they can edit it. Someone with view-only access sees a badge saying so under the title, rather than discovering it when their typing does nothing.\n\nExport takes the content out of KTIP when you need it elsewhere.',
    position: 'bottom',
  },
  replayStep,
]

export const codeTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="tool-panel"]',
    title: 'Write it, then run it',
    description:
      'Six languages, picked from the dropdown in the toolbar — changing it re-highlights what you have already written rather than clearing it.\n\nRun executes the snippet and prints to the output panel underneath, including errors. Nothing leaves your browser to do it.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="tool-actions"]',
    title: 'Keeping and sharing it',
    description:
      'Snippets autosave to your account and appear in your snippet list next time.\n\nShare gives someone else the link and decides whether they can edit. Download takes the file out with the right extension for the language.',
    position: 'bottom',
  },
  replayStep,
]

export const videoTutorialSteps: TutorialStep[] = [
  {
    target: '[data-tutorial="tool-panel"]',
    title: 'Calls by room name',
    description:
      'There are no meeting IDs to manage: type a room name, or generate one, and anyone who enters the same name joins the same call.\n\nThat also means a guessable room name is a guessable call. Generate one for anything you would not want walked into.',
    position: 'top',
    scrollMode: 'top',
  },
  {
    target: '[data-tutorial="tool-panel"]',
    title: 'Inviting people',
    description:
      'Pick members from the invite panel and KTIP sends each of them the room link as a message and a notification — no email addresses to copy around.\n\nThe same link works for anyone you paste it to, so you can pull in someone outside the platform when you need to.',
    position: 'top',
  },
  replayStep,
]
