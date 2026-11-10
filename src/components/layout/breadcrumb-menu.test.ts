import { describe, expect, it } from 'vitest'
import { crumbMenuFor, normalisePath, type CrumbViewer } from './breadcrumb-menu'

const member: CrumbViewer = { signedIn: true, unverified: false, can: () => true }
const hrefs = (path: string, viewer: CrumbViewer = member) =>
  crumbMenuFor(path, viewer)?.map((e) => e.href) ?? null

describe('normalisePath', () => {
  it('drops trailing slashes, query and hash', () => {
    expect(normalisePath('/events/')).toBe('/events')
    expect(normalisePath('/events?type=hackathon#top')).toBe('/events')
    expect(normalisePath('/')).toBe('/')
  })
})

describe('crumbMenuFor', () => {
  it('gives Home no menu', () => {
    expect(hrefs('/')).toBeNull()
  })

  it('gives a section the other sections, without Home or itself', () => {
    expect(hrefs('/projects')).toEqual(['/events', '/grants', '/directory', '/resources', '/help'])
    expect(hrefs('/events/')).toEqual(['/projects', '/grants', '/directory', '/resources', '/help'])
  })

  it('gives a page inside a bar dropdown the rest of its group', () => {
    expect(hrefs('/dashboard/events')).toEqual(['/events', '/dashboard/events', '/events/new'])
    expect(hrefs('/forums')).toEqual(['/directory', '/forums', '/collaborate', '/dashboard/connections'])
  })

  it('has no menu for a page the bar does not list', () => {
    expect(hrefs('/events/some-hackathon')).toBeNull()
    expect(hrefs('/admin')).toBeNull()
  })

  it('hides entries the viewer cannot use', () => {
    const noCreate: CrumbViewer = { ...member, can: (k) => k !== 'event:create' }
    expect(hrefs('/dashboard/events', noCreate)).toEqual(['/events', '/dashboard/events'])
  })

  it('keeps permission-gated entries for a signed-out visitor', () => {
    const visitor: CrumbViewer = { signedIn: false, unverified: false, can: () => false }
    expect(hrefs('/dashboard/events', visitor)).toContain('/events/new')
  })

  it('offers an unverified account only the sections open to it', () => {
    const unverified: CrumbViewer = { ...member, unverified: true }
    expect(hrefs('/events', unverified)).toEqual(['/grants', '/help'])
  })
})
