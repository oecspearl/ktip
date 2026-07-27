# Learnboard Editor (ProseForge)

## Overview

The Learnboard Editor is a custom-built rich text editor developed for the OECS Virtual Campus LMS. Internally codenamed **ProseForge**, it is a zero-dependency, vanilla JavaScript WYSIWYG editor built entirely with the browser's native `contenteditable` API — no external editor libraries required.

ProseForge is the default and primary editor across the platform, used in 21+ pages for creating lessons, courses, assignments, quizzes, discussions, announcements, and more.

**File:** `app/components/ProseForgeEditor.tsx` (~1,933 lines)

---

## Architecture

### Editor Switcher

The platform supports multiple editor backends via `app/components/TextEditor.tsx`, a switcher component that dynamically loads the selected editor:

| Editor | Backend | Status |
|--------|---------|--------|
| **ProseForge** | Native `contenteditable` | **Default / Primary** |
| TinyMCE | TinyMCE library | Available |
| EditorJS | Editor.js (block-based) | Available |
| Lexical | Meta's Lexical framework | Available |
| Slate | Slate.js framework | Available |

The active editor is configurable via **Admin > Platform Settings > Editor** and stored in the `site_settings` table. The TextEditor component fetches this preference from `/api/admin/settings/editor` and caches it client-side.

Previous editors (CKEditor5, Quill, and the original TipTap-based LearnboardEditor) have been deprecated and automatically migrate to ProseForge.

### Props Interface

```typescript
interface ProseForgeEditorProps {
  value: string;          // HTML content
  onChange: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  height?: number;
  showFullscreenButton?: boolean;
}
```

---

## Design

ProseForge uses a dark-themed menubar and toolbar inspired by professional desktop editors, combined with a clean white editing canvas:

- **Menubar** (dark, `#2c2c2e`): File, Edit, Insert, Format, Tools menus with keyboard shortcut indicators
- **Toolbar** (dark, `#2c2c2e`): Icon buttons grouped by function with separators
- **Editing Canvas** (white): Serif font (Literata) for body text, sans-serif (DM Sans) for headings, monospace (JetBrains Mono) for code
- **Status Bar** (dark, `#1c1c1e`): Word count, character count, and ready indicator

All styles are injected as scoped CSS via a `<style>` tag (no external stylesheets beyond Google Fonts).

---

## Features

### Text Formatting
- Bold, Italic, Underline, Strikethrough
- Subscript, Superscript
- Text color and highlight color (color pickers)
- Text alignment: Left, Center, Right, Justify
- Clear formatting

### Block Elements
- Headings: H1, H2, H3, H4
- Paragraph
- Blockquote
- Code block (preformatted)
- Horizontal rule

### Lists
- Ordered lists
- Unordered lists
- Indent / Outdent

### Media & Links
- Insert hyperlink (dialog with URL, text, title fields)
- Insert image (dialog with URL, alt text, title fields)
- Insert table (dialog with configurable rows/columns)

### Find & Replace
- Find with match count indicator
- Replace individual or replace all
- Toggled via Ctrl/Cmd+F

### Source Code View
- Toggle between WYSIWYG and raw HTML editing
- Monospace textarea with JetBrains Mono font
- Word wrap toggle
- Changes sync back to visual editor

### Fullscreen Mode
- F11 or toolbar button
- Content area expands to full viewport
- Editor content constrained to 800px max-width for readability

### Undo / Redo
- Custom history stack (up to 200 states)
- Debounced history saves (300ms)
- Full Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z support

### HTML Sanitization
- Paste handler strips `<style>`, `<script>`, `<meta>`, `<link>` tags
- Cleans class attributes and unnecessary attributes on paste
- Output sanitized via `lib/sanitize.ts` (DOMPurify-based)

---

## AI Enhancement

ProseForge includes a built-in AI content enhancement feature powered by OpenAI (GPT-4o-mini).

### Access
- Toolbar: Purple gradient "AI Enhance" button
- Menu: Tools > AI Enhance
- Keyboard: Ctrl/Cmd+Shift+A
- Works on selected text or full document

### Enhancement Modes

| Mode | Description |
|------|-------------|
| **Beautify** | Clean up and add visual formatting (callouts, tables, highlights) |
| **Lesson Format** | Transform into professional educational content with step cards, callouts, takeaway boxes |
| **Simplify** | Reduce complexity while keeping visual formatting |
| **Expand** | Add more detail, examples, and visual components |
| **Summarize** | Condense to key points with summary boxes |
| **Fix Grammar** | Correct grammar/spelling without changing structure |
| **Add Visuals** | Add visual HTML components without changing text |

### Workflow
1. Select text (or leave unselected for full document)
2. Open AI Enhance dialog
3. Choose a mode
4. Optionally add custom instructions
5. Click "Generate" — preview appears in the dialog
6. Review the enhanced content
7. Click "Accept" to apply or "Cancel" to discard

### Rich HTML Components

The AI generates styled HTML using inline styles (no CSS classes). Available component templates include:

- **Callout boxes**: Info (blue), Success (green), Warning (amber), Important (red), Note (purple)
- **Highlighted terms**: `<mark>` with colored backgrounds
- **Numbered step cards**: Circle badges with descriptions
- **Comparison grids**: 2-column card layouts
- **Styled tables**: Dark header, alternating rows
- **Styled blockquotes**: Colored borders with attribution
- **Key Takeaways boxes**: Gradient background summary sections
- **Section dividers**: Labeled horizontal rules

**API Endpoint:** `POST /api/ai/content-enhance`

```json
{
  "html": "<p>Content to enhance</p>",
  "mode": "beautify",
  "instructions": "Optional custom instructions"
}
```

**Response:**
```json
{
  "enhanced_html": "<h2>Enhanced Content</h2>..."
}
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + B | Bold |
| Ctrl/Cmd + I | Italic |
| Ctrl/Cmd + U | Underline |
| Ctrl/Cmd + E | Inline code |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Ctrl/Cmd + F | Find & Replace |
| Ctrl/Cmd + Shift + A | AI Enhance |
| Tab | Indent |
| Shift + Tab | Outdent |
| F11 | Toggle fullscreen |

---

## Usage Across the Platform

ProseForge (via the TextEditor switcher) is used in:

- **Lessons**: Create and edit lesson content (`/lessons/create`, `/lessons/[id]/edit`)
- **Courses**: Course descriptions (`/courses/create`, `/courses/[id]/edit`)
- **Assignments**: Assignment instructions and student submissions (`/assignments/[id]/edit`)
- **Quizzes**: Question content (`QuestionEditor` component)
- **Discussions**: Forum posts and replies (course discussions and community forum)
- **Announcements**: Announcement content
- **Course Forms**: Course description fields in admin course management

---

## Admin Configuration

Admins can switch the platform-wide editor via **Admin > Platform Settings**:

**API:** `GET/PUT /api/admin/settings/editor`

```json
{
  "editorType": "proseforge"
}
```

Valid values: `proseforge`, `tinymce`, `editorjs`, `lexical`, `slate`

The setting is stored in the `site_settings` table and cached client-side after the first fetch.

---

## Technical Notes

- **Zero external editor dependencies**: ProseForge uses only the browser's native `document.execCommand` API and `contenteditable` — no TipTap, ProseMirror, Slate, or other editor framework
- **Font loading**: Google Fonts (DM Sans, JetBrains Mono, Literata) loaded dynamically on first mount
- **Style injection**: All CSS is injected as a single `<style>` tag with a unique ID to prevent duplicates
- **Dynamic import**: Loaded via Next.js `dynamic()` with `ssr: false` to avoid server-side rendering issues
- **History management**: Custom undo/redo stack independent of browser's built-in undo
- **Paste sanitization**: Strips potentially dangerous elements and class attributes while preserving inline styles and content structure
