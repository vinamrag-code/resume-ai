import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useChats } from '@/store/chats'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import { renderAt } from '@/test/helpers'
import { DashboardPage } from './DashboardPage'

beforeEach(() => {
  useResumes.setState({ resumes: [] })
  useChats.setState({ chats: [] })
})

describe('deleting a resume', () => {
  it("also deletes that resume's saved Agent conversation, and leaves other conversations alone", async () => {
    const a = useResumes.getState().create('Doomed', sampleContent())
    const b = useResumes.getState().create('Keeper', sampleContent())
    for (const r of [a, b]) useChats.getState().setTurns(r.id, () => [{ id: 't', role: 'user', content: `chat for ${r.name}`, changes: [] }])
    renderAt(<DashboardPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Doomed' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(useResumes.getState().resumes.map((r) => r.name)).toEqual(['Keeper'])
    expect(useChats.getState().chats.map((c) => c.resumeId)).toEqual([b.id])
  })
})
