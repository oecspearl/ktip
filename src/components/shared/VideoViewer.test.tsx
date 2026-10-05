import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { VideoLinkButton } from './VideoViewer'

const LOOM = 'https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184'

/** BentoCard's corner slot: everything clicked inside it is preventDefault'ed. */
function CardSlot({ children }: { children: ReactNode }) {
  return (
    <div
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {children}
    </div>
  )
}

describe('VideoLinkButton', () => {
  it('opens a player built from the parsed ID', () => {
    render(<VideoLinkButton url={LOOM} title="Solar dryer" />)
    fireEvent.click(screen.getByRole('button', { name: 'Watch the video' }))

    expect(screen.getByRole('dialog', { name: 'Solar dryer' })).toBeInTheDocument()
    expect(screen.getByTitle('Solar dryer')).toHaveAttribute(
      'src',
      'https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184'
    )
  })

  it('offers the link in a new tab when it cannot play inline', () => {
    const folder = 'https://drive.google.com/drive/folders/1xyzFolderId0000'
    render(<VideoLinkButton url={folder} />)
    fireEvent.click(screen.getByRole('button', { name: 'Watch the video' }))

    expect(document.querySelector('iframe')).toBeNull()
    expect(screen.getByText(/can't play here/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open in a new tab/ })).toHaveAttribute('href', folder)
  })

  it("keeps the new-tab link working from inside a card's corner slot", () => {
    render(
      <CardSlot>
        <VideoLinkButton url={LOOM} />
      </CardSlot>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Watch the video' }))

    // fireEvent returns false when something called preventDefault.
    const notPrevented = fireEvent.click(screen.getByRole('link', { name: /Open in a new tab/ }))
    expect(notPrevented).toBe(true)
  })
})
