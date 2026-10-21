import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBank } from '@/store/bank'
import { useCoverLetters } from '@/store/coverLetters'
import { useJobs } from '@/store/jobs'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import { renderAt } from '@/test/helpers'
import { DashboardPage } from './DashboardPage'

beforeEach(() => {
  useResumes.setState({ resumes: [] })
  useJobs.setState({ jobs: [] })
  useCoverLetters.setState({ letters: [] })
  useBank.setState({ items: [] })
})

describe('dashboard', () => {
  it('welcomes a new user with a checklist and empty states', () => {
    renderAt(<DashboardPage />)
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByText('0 of 5 done')).toBeInTheDocument()
    expect(screen.getByText(/No resumes yet/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing tracked yet/)).toBeInTheDocument()
  })

  it('shows the user\'s name, counts and recent items', () => {
    useResumes.getState().create('Backend CV', sampleContent())
    useJobs.getState().add({ title: 'Data Engineer', company: 'Globex', status: 'interviewing' })
    useJobs.getState().add({ title: 'SRE', company: 'Initech', status: 'rejected' })
    renderAt(<DashboardPage />)
    expect(screen.getByRole('heading', { name: 'Welcome back, Ada' })).toBeInTheDocument()
    const stats = within(screen.getByRole('list', { name: 'Overview' }))
    expect(stats.getByText('Resumes').previousElementSibling).toHaveTextContent('1')
    // The rejected application is not counted as live.
    expect(stats.getByText('Applications').previousElementSibling).toHaveTextContent('1')
    expect(stats.getByText('Interviews and offers').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByRole('link', { name: 'Backend CV' })).toHaveAttribute('href', expect.stringMatching(/^\/resume\//))
    expect(screen.getByText('Data Engineer')).toBeInTheDocument()
    expect(screen.getByText('2 of 5 done')).toBeInTheDocument()
  })
})
