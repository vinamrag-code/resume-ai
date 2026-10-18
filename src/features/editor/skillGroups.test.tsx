import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { sampleContent } from '@/test/fixtures'
import type { ResumeContent } from '@/types/resume'
import { ResumeEditor } from './ResumeEditor'

function Harness({ onContent }: { onContent: (c: ResumeContent) => void }) {
  const [c, setC] = useState<ResumeContent>({ ...sampleContent(), skills: ['Python', 'Go', 'Docker'] })
  return (
    <ResumeEditor
      content={c}
      onChange={(fn) => {
        const next = fn(c)
        setC(next)
        onContent(next)
      }}
    />
  )
}

describe('skills sub-headings in the editor', () => {
  it('groups, edits and flattens without losing skills', () => {
    let last!: ResumeContent
    render(<Harness onContent={(c) => (last = c)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group under sub-headings' }))
    fireEvent.change(screen.getByLabelText('Sub-heading 1'), { target: { value: 'Languages' } })
    fireEvent.change(screen.getByLabelText(/Skills under Languages/), { target: { value: 'Python, Go, Rust' } })
    // Dropping Docker from the box removes it from the resume; typing Rust adds it.
    expect(last.skills).toEqual(['Python', 'Go', 'Rust'])
    expect(last.skillGroups[0]).toMatchObject({ heading: 'Languages', skills: ['Python', 'Go', 'Rust'] })

    fireEvent.click(screen.getByRole('button', { name: 'Add a sub-heading' }))
    fireEvent.change(screen.getByLabelText('Sub-heading 2'), { target: { value: 'Tools' } })
    fireEvent.change(screen.getByLabelText(/Skills under Tools/), { target: { value: 'Docker' } })
    expect(last.skills).toEqual(['Python', 'Go', 'Rust', 'Docker'])

    fireEvent.click(screen.getByRole('button', { name: 'Remove sub-heading 2' }))
    expect(screen.getByText(/Not under a sub-heading/)).toBeTruthy()
    expect(last.skills).toEqual(['Python', 'Go', 'Rust', 'Docker'])

    fireEvent.click(screen.getByRole('button', { name: 'Remove sub-headings' }))
    expect(last.skillGroups).toEqual([])
    expect(last.skills).toEqual(['Python', 'Go', 'Rust', 'Docker'])
  })
})
