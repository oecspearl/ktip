export const config = { runtime: 'edge' }

/**
 * Hands the shared test logins to the /test-creds/ page once a tester enters
 * the passcode.
 *
 * The logins never ship in public code. public/test-creds/index.html is a
 * passcode form and an empty table; everything in the table comes from here,
 * and only after TEST_CREDS_PASSCODE matches. The accounts themselves are made
 * by scripts/seed-test-accounts.mjs, which sets the same password on all of
 * them, and that password lives in TEST_ACCOUNTS_PASSWORD on Vercel.
 *
 *   TEST_CREDS_PASSCODE     what testers type. Min 12 characters, or the
 *                           endpoint refuses to serve at all: Edge has no
 *                           state to count attempts in, so the passcode's
 *                           length is the only brake on guessing.
 *   TEST_ACCOUNTS_PASSWORD  the password the seed script set.
 *   TEST_ACCOUNTS_DOMAIN    optional, defaults to ktip.test. Must match the
 *                           --domain the seed script ran with.
 *
 * Unset either required variable and the endpoint answers 404, so taking the
 * page down is one env var away and needs no deploy of code.
 *
 * Keep ACCOUNTS in step with the ACCOUNTS list in the seed script.
 */

const ACCOUNTS: Array<{ tier: 'admin' | 'organisation' | 'individual'; slug: string; name: string; does: string }> = [
  { tier: 'admin', slug: 'admin', name: 'Admin', does: 'Every console page. Cannot change another administrator.' },
  { tier: 'admin', slug: 'people_supervisor', name: 'People & Trust Supervisor', does: 'Members (read-only), verification, institutions, moderation, grievances.' },
  { tier: 'admin', slug: 'programme_supervisor', name: 'Programmes Supervisor', does: 'Projects, grants, forums, resources, achievements, employers.' },
  { tier: 'admin', slug: 'safety_admin', name: 'Safety Admin', does: 'Flagged content and moderation logs.' },
  { tier: 'organisation', slug: 'chamber_admin', name: 'Chamber of Commerce / BSO', does: 'Verifies local businesses in Saint Lucia.' },
  { tier: 'organisation', slug: 'diaspora', name: 'Diaspora Association / Network', does: 'Mentors, funds and judges challenges from abroad.' },
  { tier: 'organisation', slug: 'educational_partner', name: 'Post-Secondary Institution', does: 'Approves students and oversees their submissions.' },
  { tier: 'organisation', slug: 'government', name: 'Government Ministry / Agency', does: 'Publishes funding calls and runs awards.' },
  { tier: 'organisation', slug: 'igo', name: 'Inter-governmental Regional Organization', does: 'Funds and convenes across the region.' },
  { tier: 'organisation', slug: 'investor', name: 'Investor / Funding Agency', does: 'Posts grants and reviews vetted projects.' },
  { tier: 'organisation', slug: 'ngo', name: 'Non-Governmental Organization', does: 'Runs projects and events, applies for funding.' },
  { tier: 'organisation', slug: 'private_sector', name: 'Private Sector', does: 'Business account a chamber can verify.' },
  { tier: 'organisation', slug: 'research_institution', name: 'Research Institution', does: 'Publishes research, co-hosts events, sponsors students.' },
  { tier: 'individual', slug: 'entrepreneur', name: 'Entrepreneur', does: 'Builds projects and applies for grants.' },
  { tier: 'individual', slug: 'faculty', name: 'Faculty', does: 'Sponsors student applications and supervises student channels.' },
  { tier: 'individual', slug: 'ip_legal', name: 'IP / Legal Professional', does: 'Runs projects and events, mentors, sponsors funding.' },
  { tier: 'individual', slug: 'mentor', name: 'Mentor', does: 'Guides innovators.' },
  { tier: 'individual', slug: 'researcher', name: 'Researcher', does: 'Publishes research and joins projects.' },
  { tier: 'individual', slug: 'student', name: 'Student', does: 'Read-only on grants. No unmonitored direct messages.' },
]

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  })

// Hash both sides, then compare the digests byte by byte without an early
// exit, so the response time says nothing about how much of a guess was right.
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const x = new Uint8Array(da)
  const y = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i]
  return diff === 0
}

export default async function handler(request: Request) {
  const passcode = process.env.TEST_CREDS_PASSCODE ?? ''
  const password = process.env.TEST_ACCOUNTS_PASSWORD ?? ''
  if (passcode.length < 12 || !password) return json({ error: 'not_found' }, 404)

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let attempt = ''
  try {
    const body = (await request.json()) as { passcode?: unknown }
    if (typeof body.passcode === 'string') attempt = body.passcode.slice(0, 200)
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  if (!(await sameSecret(attempt, passcode))) {
    // A flat delay on every miss: cheap, and it makes scripted guessing slow.
    await new Promise((r) => setTimeout(r, 800))
    return json({ error: 'wrong_passcode' }, 401)
  }

  const domain = (process.env.TEST_ACCOUNTS_DOMAIN || 'ktip.test').toLowerCase()
  return json(
    {
      password,
      accounts: ACCOUNTS.map((a) => ({
        ...a,
        email: `test.${a.slug.replace(/_/g, '-')}@${domain}`,
      })),
    },
    200
  )
}
