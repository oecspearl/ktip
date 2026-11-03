import { describe, expect, it } from 'vitest'
import {
  deckObjectPath,
  formatDuration,
  isHttpUrl,
  parseDuration,
  submissionMissing,
  type ChecklistCriterion,
} from './submission-checklist'

const criteria: ChecklistCriterion[] = [
  { id: 'o1', kind: 'objective', is_required: true },
  { id: 'd1', kind: 'deliverable', is_required: true },
  { id: 'd2', kind: 'deliverable', is_required: false },
  { id: 'c1', kind: 'constraint', is_required: true },
  { id: 'j1', kind: 'judging_criterion', is_required: true },
]

const complete = {
  title: 'Tidewatch',
  description: 'Flood alerts by SMS.',
  repo_url: 'https://github.com/x/y',
  demo_video_url: 'https://youtu.be/z',
  demo_video_seconds: 170,
  pitch_deck_path: 'abc/deck.pdf',
  ai_use: 'none',
}

describe('submissionMissing', () => {
  it('asks for a title before anything else exists', () => {
    expect(submissionMissing(null, criteria, [])).toEqual(['title'])
  })

  it('lists every gap in a blank entry, and only required objectives and deliverables', () => {
    expect(submissionMissing({ title: ' ' }, criteria, [])).toEqual([
      'title',
      'summary',
      'repo',
      'video',
      'deck',
      'ai',
      'evidence:o1',
      'evidence:d1',
    ])
  })

  it('wants the video length once there is a video', () => {
    const missing = submissionMissing(
      { ...complete, demo_video_seconds: null },
      criteria,
      [
        { criterion_id: 'o1', note: 'yes' },
        { criterion_id: 'd1', url: 'https://x.y' },
      ]
    )
    expect(missing).toEqual(['video_length'])
  })

  it('accepts a deck link in place of a file', () => {
    const entry = { ...complete, pitch_deck_path: null, pitch_deck_url: 'https://slides.example' }
    const evidence = [
      { criterion_id: 'o1', note: 'yes' },
      { criterion_id: 'd1', note: 'yes' },
    ]
    expect(submissionMissing(entry, criteria, evidence)).toEqual([])
  })

  it('does not count blank evidence', () => {
    const evidence = [
      { criterion_id: 'o1', note: '  ', url: '' },
      { criterion_id: 'd1', note: 'done' },
    ]
    expect(submissionMissing(complete, criteria, evidence)).toEqual(['evidence:o1'])
  })
})

describe('durations', () => {
  it('reads minutes and seconds or plain seconds', () => {
    expect(parseDuration('2:45')).toBe(165)
    expect(parseDuration('165')).toBe(165)
    expect(parseDuration(' 0:59 ')).toBe(59)
    expect(parseDuration('2:75')).toBeNull()
    expect(parseDuration('three')).toBeNull()
    expect(parseDuration('')).toBeNull()
  })

  it('writes m:ss', () => {
    expect(formatDuration(165)).toBe('2:45')
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(null)).toBe('')
  })
})

describe('links and paths', () => {
  it('only accepts http and https', () => {
    expect(isHttpUrl('https://github.com/x')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('github.com/x')).toBe(false)
  })

  it('builds a deck path the database accepts', () => {
    const path = deckObjectPath('11111111-2222-3333-4444-555555555555', 'Our Deck (final).pdf', 0)
    expect(path).toMatch(/^11111111-2222-3333-4444-555555555555\/[A-Za-z0-9._-]{1,160}$/)
    expect(path.endsWith('Our_Deck_final_.pdf')).toBe(true)
  })
})
