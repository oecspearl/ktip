import type { HelpCategory } from './types'

export const COLLABORATION_CATEGORY: HelpCategory = {
  id: 'collaboration',
  title: 'Collaboration Tools',
  description: 'Whiteboards, documents, code sandboxes and video calls.',
  icon: 'Handshake',
  articles: [
    {
      id: 'collaboration-overview',
      title: 'What collaboration tools are available?',
      content: `The Collaborate hub offers four tools.\n\nWhiteboard — an interactive visual canvas for brainstorming and diagrams.\n\nDocument Editor — rich-text documents written and edited together.\n\nCode Sandbox — write, run and share code snippets across six languages.\n\nVideo Conference — real-time video calls.\n\nAll four require an account. Each of the first three opens a list of the items you already have rather than a blank canvas, so nothing you make gets lost.`,
      tags: ['collaboration', 'tools', 'overview', 'whiteboard', 'document', 'code', 'video'],
    },
    {
      id: 'collab-lists',
      title: 'Where are the whiteboards and documents I made?',
      content: `Each tool has its own list page: Whiteboards, Documents and Snippets under Collaborate.\n\nA list shows what you own and what has been shared with you, with the most recently touched first. Open one to carry on, or use the new button to start another.\n\nThe cards on the Collaborate hub link to these lists. Nothing you save is only reachable from a link you have to remember.`,
      tags: ['list', 'my whiteboards', 'my documents', 'snippets', 'saved', 'find'],
    },
    {
      id: 'whiteboard',
      title: 'How do I use the Whiteboard?',
      content: `Open Collaborate, click Whiteboard, then create a new board or open an existing one.\n\nThe canvas is free-form: draw, add text, place shapes, arrange and connect them. Tools sit in the toolbar.\n\nBoards are good for the thinking stage — mapping a problem, sketching an architecture, running a retrospective — before any of it goes into a document.\n\nShare a board with collaborators to work on it together.`,
      tags: ['whiteboard', 'draw', 'brainstorm', 'canvas', 'diagram', 'tldraw'],
    },
    {
      id: 'document-editor',
      title: 'How do I use the Document Editor?',
      content: `Open Collaborate, click Document Editor, then create or open a document.\n\nThe editor handles headings, bold and italic, lists, links, images and code blocks.\n\nIt suits project plans, meeting notes, research outlines and grant narratives you want to draft before pasting into an application.\n\nDocuments can be shared with other members and exported.`,
      tags: ['document', 'editor', 'write', 'text', 'rich text', 'collaborate'],
    },
    {
      id: 'document-export',
      title: 'How do I export a document?',
      content: `Open the document and use its export action.\n\nExport gives you a copy you can attach to an email or upload elsewhere, with the formatting preserved.\n\nExporting is a snapshot. Later edits in KTIP do not change a file you already exported, so export again when the content has moved on.`,
      tags: ['export', 'download', 'document', 'file', 'save'],
    },
    {
      id: 'code-editor',
      title: 'How do I use the Code Sandbox?',
      content: `Open Collaborate, click Code Sandbox, then create or open a snippet.\n\nSix languages are supported: JavaScript/TypeScript, Python, HTML, CSS, JSON and Markdown. Pick one from the toolbar and you get matching syntax highlighting.\n\nJavaScript snippets can be run in the browser, with results in the output panel below the editor. HTML and CSS snippets get a live preview panel instead.\n\nYou can adjust the editor font size, and every snippet is saved to your snippets list.`,
      tags: ['code', 'sandbox', 'editor', 'run', 'preview', 'javascript', 'python'],
    },
    {
      id: 'share-collab-item',
      title: 'How do I share a whiteboard, document or snippet?',
      content: `Open the item and use its share action.\n\nAdd members at one of two access levels: view only, or can edit.\n\nEveryone you add gets a notification and an entry in their invitations inbox — they do not have to be watching for a link.\n\nYou can change someone's access level or remove them later from the same dialog. Removing access takes effect immediately.`,
      tags: ['share', 'permissions', 'invite', 'access', 'view', 'edit'],
    },
    {
      id: 'local-draft-rescue',
      title: 'My old code drafts are missing from my snippets',
      content: `Early drafts were kept only in your browser rather than on the platform. Those are not lost, but they are not in your snippets list either.\n\nThe Snippets page detects local drafts and offers to import them. Accepting turns each one into a real snippet you can share and reach from any device.\n\nDo this from the same browser and profile you originally wrote them in — that is where the local copies live.`,
      tags: ['drafts', 'local', 'import', 'recover', 'snippets', 'missing'],
    },
    {
      id: 'video-conference',
      title: 'How do I start a video conference?',
      content: `Open Collaborate and click Video Conference.\n\nName a room or let KTIP generate a name, then join. Your browser will ask for camera and microphone permission — the call cannot start until you allow it.\n\nCopy the share link to bring in anyone, or invite your connections directly from the page. Each invited connection receives a direct message and a notification with the link.\n\nUse it for team meetings, mentoring sessions and pitches. For a whole hackathon, an event venue is the better fit.`,
      tags: ['video', 'conference', 'call', 'meeting', 'camera', 'invite', 'room'],
    },
  ],
}
