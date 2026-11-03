import { describe, expect, it } from 'vitest'
import { cleanLink, parseGithubRepo } from './team-links'

describe('parseGithubRepo', () => {
  it.each([
    ['team-alpha/catchvoice', 'team-alpha/catchvoice'],
    ['https://github.com/team-alpha/catchvoice', 'team-alpha/catchvoice'],
    ['https://github.com/team-alpha/catchvoice/tree/main/src', 'team-alpha/catchvoice'],
    ['git@github.com:team-alpha/catchvoice.git', 'team-alpha/catchvoice'],
    ['  https://www.github.com/a/b/  ', 'a/b'],
  ])('%s → %s', (input, out) => {
    expect(parseGithubRepo(input)).toBe(out)
  })

  it('rejects things that are not a repo', () => {
    expect(parseGithubRepo('')).toBeNull()
    expect(parseGithubRepo('https://gitlab.com/a/b')).toBeNull()
    expect(parseGithubRepo('just-a-name')).toBeNull()
  })
})

describe('cleanLink', () => {
  it('accepts the right service', () => {
    expect(cleanLink('discord_url', 'https://discord.gg/abc')).toBe('https://discord.gg/abc')
    expect(cleanLink('zoom_url', 'https://us02web.zoom.us/j/123')).toBe('https://us02web.zoom.us/j/123')
    expect(cleanLink('notion_url', 'https://team.notion.site/Notes-1')).toBe('https://team.notion.site/Notes-1')
  })

  it('treats empty as no link', () => {
    expect(cleanLink('zoom_url', '   ')).toBeNull()
  })

  it('refuses a link to somewhere else', () => {
    expect(cleanLink('zoom_url', 'https://zoom.us.evil.example/j/1')).toBe(false)
    expect(cleanLink('discord_url', 'http://discord.gg/abc')).toBe(false)
  })
})
