import type { HelpCategory } from './types'

export const PROJECTS_CATEGORY: HelpCategory = {
  id: 'projects',
  title: 'Projects',
  description: 'Create, browse and manage innovation projects.',
  icon: 'FolderKanban',
  articles: [
    {
      id: 'browse-projects',
      title: 'How do I browse projects?',
      content: `Click "Projects" in the navigation bar.\n\nYou will see every public project. Search by keyword, filter by category (Technology, Healthcare, Education, Agriculture, Environment or Other) or by phase (Concept, Prototype, Funding or Launch).\n\nOnce you have set your interests in Settings you can also sort by "For You", which ranks projects against the topics you picked.\n\nClick any card for the full project, including the owner, team, documents and comments.`,
      tags: ['browse', 'projects', 'search', 'filter', 'explore', 'for you'],
    },
    {
      id: 'create-project',
      title: 'How do I create a new project?',
      content: `Go to the Projects page and click "Create Project".\n\nRequired: a title of at least 3 characters and a category. You also pick a phase — Concept, Prototype, Funding or Launch.\n\nOptional: a description, a short summary used on cards and previews, a Details section where you add your own key/value rows, up to 10 hashtags, a Climate Action flag, and whether the project is public or private.\n\nClimate Action projects surface in climate filters and get a boost for members who turned on the climate preference.`,
      tags: ['create', 'project', 'new', 'start', 'build', 'climate'],
    },
    {
      id: 'project-create-permission',
      title: 'Why can I not create a project?',
      content: `Project creation is behind a permission, not just a login. Roles built around funding and oversight — Investor, for example — do not hold it by default.\n\nIf your role does not have it, opening the create page tells you so rather than failing after you have filled the form in.\n\nOECS administrators control the permission matrix, so if you believe your role should be able to create projects, raise it with them. You can still be added to someone else's project as an editor and work on it that way.`,
      tags: ['permission', 'cannot create', 'blocked', 'project', 'role'],
    },
    {
      id: 'edit-project',
      title: 'How do I edit my project?',
      content: `Open the project and click "Edit" near the top.\n\nThe owner can always edit. Team members added with the editor scope can edit too — viewers cannot.\n\nYou can change the title, summary, description, category, phase, details, hashtags, the Climate Action flag and visibility. Click "Save Changes" when you are done.\n\nOECS administrators can edit any project from the admin console.`,
      tags: ['edit', 'update', 'modify', 'change', 'project', 'editor'],
    },
    {
      id: 'project-team',
      title: 'How do I manage my project team?',
      content: `Open your project and find the Team panel, then click "Manage Team".\n\nSearch for a member and add them with one of two scopes. Editor lets them change the project. Viewer gives read access to the project and its documents without edit rights.\n\nInvited members get a notification and an entry in their invitations inbox. You can change someone's scope or remove them from the same panel.\n\nThese scopes apply to that one project only — they are not platform roles.`,
      tags: ['team', 'members', 'invite', 'editor', 'viewer', 'collaborators'],
    },
    {
      id: 'project-phases',
      title: 'What do the project phases mean?',
      content: `Concept — still an idea. You are exploring whether it could work.\n\nPrototype — you are building a first version or MVP.\n\nFunding — the project needs money to grow and you are looking for grants, investors or sponsors.\n\nLaunch — ready to go live, or already launched.\n\nUpdate the phase as the project moves. Funders browsing the Projects list filter by phase, so keeping it current matters.`,
      tags: ['phase', 'concept', 'prototype', 'funding', 'launch', 'stages'],
    },
    {
      id: 'project-comments',
      title: 'How do comments, likes and follows work?',
      content: `Scroll to the Comments section on any project to leave a comment or ask a question.\n\nThe heart button is a like — a one-tap signal that pushes popular projects up in the listings.\n\nFollowing is different: it subscribes you to the project so its updates reach your notifications. Investors and mentors usually follow, rather than like, the projects they are tracking.\n\nAll three need you to be signed in.`,
      tags: ['comments', 'likes', 'follow', 'feedback', 'engage'],
    },
    {
      id: 'project-documents',
      title: 'How do I attach documents to a project?',
      content: `Project pages have a Documents section for the files that belong to the work — proposals, budgets, designs, reports.\n\nUpload a file and set who can see it. Members who cannot see a document can request access, and you approve or decline the request.\n\nUploaded documents are scanned for recognisable fields, and you get a review step to confirm or correct what was picked up before it is saved.\n\nOnly the project owner and editors can upload.`,
      tags: ['documents', 'files', 'upload', 'attach', 'access', 'extraction'],
    },
    {
      id: 'delete-project',
      title: 'How do I delete a project?',
      content: `Deletion is on the project's own page, and only the owner (or an OECS administrator) can do it.\n\nBefore anything is removed you get a summary of exactly what goes with it — comments, likes, team memberships, documents. If something blocks deletion, that is spelled out instead.\n\nDeleting a project cannot be undone. If you only want it out of public view, switch its visibility to private instead.`,
      tags: ['delete', 'remove', 'project', 'permanent', 'private'],
    },
  ],
}
