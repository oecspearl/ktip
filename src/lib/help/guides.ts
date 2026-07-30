import type { GettingStartedGuide } from './types'

/**
 * Role-based quick starts shown as cards at the top of the Help Center.
 *
 * Order matters — the member's own role is ringed in place rather than hoisted,
 * so the self-assignable individual roles come first and the review-gated
 * organisation and admin roles follow.
 */
export const GETTING_STARTED_GUIDES: GettingStartedGuide[] = [
  {
    role: 'student',
    title: 'Students',
    description: 'Explore projects, join events, and find funding for your ideas.',
    steps: [
      'Sign up with your school or university email so your institution can verify you',
      'Complete your profile with your skills and interests',
      'Browse projects for inspiration or create your own',
      'Check Events for hackathons and workshops you can join',
      'Nominate a faculty sponsor early — you need one to submit a grant application',
    ],
    quickLinks: [
      { label: 'Browse Projects', href: '/projects' },
      { label: 'Find Events', href: '/events' },
      { label: 'Explore Grants', href: '/grants' },
    ],
  },
  {
    role: 'entrepreneur',
    title: 'Entrepreneurs',
    description: 'Launch projects, apply for grants, and find investors.',
    steps: [
      'Create your account and set your role to Entrepreneur',
      'Create a project to showcase your innovation',
      'Browse grants and apply with the guided five-step wizard',
      'Track your applications under My Applications',
      'Connect with mentors and investors from the member directory',
    ],
    quickLinks: [
      { label: 'Create Project', href: '/projects/new' },
      { label: 'Find Grants', href: '/grants' },
      { label: 'My Applications', href: '/grants/my-applications' },
    ],
  },
  {
    role: 'mentor',
    title: 'Mentors',
    description: 'Guide innovators, review ideas, and share your expertise.',
    steps: [
      'Create your account and set your role to Mentor',
      'Complete your profile with your expertise and experience',
      'Browse projects to find innovators you can help',
      'Open the messaging panel from the floating button to reach mentees',
      'Share what you know in the community forums',
    ],
    quickLinks: [
      { label: 'Browse Projects', href: '/projects' },
      { label: 'Member Directory', href: '/directory' },
      { label: 'Visit Forums', href: '/forums' },
    ],
  },
  {
    role: 'investor',
    title: 'Investors & Funding Agencies',
    description: 'Discover projects, publish grants, and connect with innovators.',
    steps: [
      'Create your account and set your role to Investor',
      'Browse projects, filtering by phase to find Funding-stage work',
      'Follow the projects you want to track — following sends you their updates',
      'Message founders directly from their member page',
      'Attend demo days and conferences listed under Events',
    ],
    quickLinks: [
      { label: 'Browse Projects', href: '/projects' },
      { label: 'Member Directory', href: '/directory' },
      { label: 'Find Events', href: '/events' },
    ],
  },
  {
    role: 'researcher',
    title: 'Researchers',
    description: 'Publish research, find collaborators, and join projects.',
    steps: [
      'Create your account and set your role to Researcher',
      'Add your fields and skills so collaborators can find you in the directory',
      'Browse projects for work that needs a research partner',
      'Use documents and whiteboards to draft and plan together',
      'Look for research grants under Grants & Funding',
    ],
    quickLinks: [
      { label: 'Browse Projects', href: '/projects' },
      { label: 'Collaborate', href: '/collaborate' },
      { label: 'Find Grants', href: '/grants' },
    ],
  },
  {
    role: 'faculty',
    title: 'Faculty',
    description: 'Sponsor student applications and supervise student channels.',
    steps: [
      'Sign up and select Faculty — your institution confirms the role',
      'Watch your invitations for student sponsor nominations',
      'Review a nominated application before you accept: your acceptance unlocks submission',
      'Supervise the student channels your institution assigns to you',
      'Track your students and research from the Dashboard rail',
    ],
    quickLinks: [
      { label: 'My Invitations', href: '/invitations' },
      { label: 'Find Grants', href: '/grants' },
      { label: 'My Dashboard', href: '/dashboard' },
    ],
  },
  {
    role: 'private_sector',
    title: 'Private Sector',
    description: 'Find partnerships, attend events, and support innovation.',
    steps: [
      'Create your account and set your role to Private Sector',
      'Submit your business to your Chamber of Commerce to become a Verified SME',
      'Browse projects for partnership opportunities',
      'Attend events to meet the innovation community',
      'Use the collaboration tools for joint work',
    ],
    quickLinks: [
      { label: 'Business Verification', href: '/sme/verification' },
      { label: 'Browse Projects', href: '/projects' },
      { label: 'Find Events', href: '/events' },
    ],
  },
  {
    role: 'sme',
    title: 'Verified SMEs',
    description: 'Use your Chamber-verified status to partner and hire.',
    steps: [
      'Get verified by your national Chamber of Commerce',
      'Complete your business profile so partners know what you do',
      'Browse projects for suppliers, partners and pilot opportunities',
      'Sponsor or host events, including hackathon sponsor booths',
      'Track your business status from the Business tab on your Dashboard',
    ],
    quickLinks: [
      { label: 'Business Verification', href: '/sme/verification' },
      { label: 'Browse Projects', href: '/projects' },
      { label: 'Resources', href: '/resources' },
    ],
  },
  {
    role: 'educational_partner',
    title: 'Educational Partners',
    description: 'Verify your students, oversee submissions, and sponsor applications.',
    steps: [
      'Register your institution with OECS to be granted the role',
      'Confirm the email domains that verify your students automatically',
      'Approve student accounts as they sign up',
      'Accept sponsor nominations on student grant applications',
      'Oversee what your students submit from the admin queues',
    ],
    quickLinks: [
      { label: 'My Invitations', href: '/invitations' },
      { label: 'My Dashboard', href: '/dashboard' },
      { label: 'Find Grants', href: '/grants' },
    ],
  },
  {
    role: 'chamber_admin',
    title: 'Chambers of Commerce',
    description: 'Vet and onboard the SMEs in your member state.',
    steps: [
      'Get your Chamber account granted by OECS',
      'Work through the SME submissions queued for your member state',
      'Check each legal name and registration number against your own records',
      'Approve to grant Verified SME status, or decline with a reason',
      'Keep an eye on the queue — unverified businesses cannot use SME features',
    ],
    quickLinks: [
      { label: 'Admin Console', href: '/admin/chamber' },
      { label: 'Member Directory', href: '/directory' },
      { label: 'Resources', href: '/resources' },
    ],
  },
  {
    role: 'oecs',
    title: 'OECS Administrators',
    description: 'Run the platform, publish grants, and organise regional events.',
    steps: [
      'Ask an existing Super Admin to grant your admin role — it cannot be self-assigned',
      'Publish grant opportunities, leaving the external URL empty to use the in-app wizard',
      'Organise events and build out their workspace, schedule and venue',
      'Work the moderation, grievance and verification queues',
      'Maintain the permission matrix under Roles',
    ],
    quickLinks: [
      { label: 'Admin Console', href: '/admin' },
      { label: 'Create Event', href: '/events/new' },
      { label: 'Moderation', href: '/admin/moderation' },
    ],
  },
]
