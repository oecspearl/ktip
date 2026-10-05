/**
 * The sandbox's languages and their starter templates, apart from the editor.
 *
 * The snippets list compares local drafts against these templates, and while
 * they lived in CodeMirrorEditor.tsx that comparison imported the editor —
 * CodeMirror, its basic setup and its theme — into a page that never shows
 * one. Plain data here, so reading a template costs nothing.
 */

export type Language = 'javascript' | 'python' | 'html' | 'css' | 'json' | 'markdown'

export const defaultCode: Record<Language, string> = {
  javascript: `// JavaScript / TypeScript
function greet(name) {
  console.log(\`Hello, \${name}!\`);
}

greet("Caribbean Innovator");
`,
  python: `# Python
def greet(name):
    print(f"Hello, {name}!")

greet("Caribbean Innovator")
`,
  html: `<!-- HTML -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KTIP Project</title>
</head>
<body>
  <h1>Hello, Caribbean!</h1>
</body>
</html>
`,
  css: `/* CSS */
body {
  font-family: 'Inter', sans-serif;
  background: linear-gradient(135deg, #041E42, #97D700);
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100svh;
}
`,
  json: `{
  "name": "KTIP Project",
  "version": "1.0.0",
  "description": "Caribbean innovation platform",
  "tags": ["education", "collaboration", "caribbean"]
}
`,
  markdown: `# Welcome to KTIP

## About
KTIP connects Caribbean innovators, educators, and students.

### Features
- Real-time collaboration
- Interactive code sandbox
- Project management
- Community forums

> Building the future of Caribbean innovation together!
`,
}
