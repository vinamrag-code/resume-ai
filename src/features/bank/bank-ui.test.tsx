import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearEmbeddingCache } from '@/lib/bank/retrieve'
import { createBackup, restoreBackup } from '@/store/backup'
import { useBank } from '@/store/bank'
import { useResumes } from '@/store/resumes'
import { sampleContent } from '@/test/fixtures'
import { renderAt } from '@/test/helpers'
import { BankList } from './BankList'

const draft = (over: Partial<Parameters<ReturnType<typeof useBank.getState>['add']>[0]>) => ({ kind: 'project' as const, title: '', org: '', location: '', start: '', end: '', link: '', bullets: [], skills: [], ...over })

beforeEach(() => {
  clearEmbeddingCache()
  useBank.setState({ items: [] })
  useResumes.setState({ resumes: [] })
})

describe('experience bank list', () => {
  it('adds an item with bullets and skills, edits it and deletes it', async () => {
    renderAt(<BankList />)
    expect(screen.getByText('Your experience bank is empty')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add experience' }))
    await userEvent.type(screen.getByLabelText('Project name'), 'Habit tracker')
    await userEvent.type(screen.getByLabelText(/What you did/), '- Built a React app{enter}Reached 300 users')
    await userEvent.type(screen.getByLabelText(/Skills and tools/), 'React, React, Firebase')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(useBank.getState().items[0]).toMatchObject({ kind: 'project', title: 'Habit tracker', bullets: ['Built a React app', 'Reached 300 users'], skills: ['React', 'Firebase'] })
    expect(screen.getByText('Built a React app')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Habit tracker' }))
    await userEvent.clear(screen.getByLabelText('Project name'))
    await userEvent.type(screen.getByLabelText('Project name'), 'Habit app')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(useBank.getState().items).toHaveLength(1)
    expect(useBank.getState().items[0]!.title).toBe('Habit app')

    await userEvent.click(screen.getByRole('button', { name: 'Delete Habit app' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete Habit app' }))
    expect(useBank.getState().items).toHaveLength(0)
  })

  it('needs a company for work experience and at least one bullet', async () => {
    renderAt(<BankList />)
    await userEvent.click(screen.getByRole('button', { name: 'Add experience' }))
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'work')
    await userEvent.type(screen.getByLabelText('Job title'), 'Engineer')
    await userEvent.type(screen.getByLabelText(/What you did/), 'Did things')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Company'), 'Acme')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('imports from existing resumes once, without duplicates', async () => {
    useResumes.getState().create('A', sampleContent())
    useResumes.getState().create('B', sampleContent())
    renderAt(<BankList />)
    await userEvent.click(screen.getByRole('button', { name: 'Import from my resumes' }))
    const n = useBank.getState().items.length
    expect(n).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Import from my resumes' }))
    expect(useBank.getState().items).toHaveLength(n)
    expect(screen.getByRole('status')).toHaveTextContent('already in the bank')
  })
})

describe('backup', () => {
  it('includes the bank and restores it, and older backups without one still load', () => {
    useBank.getState().add(draft({ title: 'Kept', bullets: ['x'] }))
    const backup = createBackup()
    expect(backup.bank).toHaveLength(1)
    useBank.setState({ items: [] })
    expect(restoreBackup(JSON.stringify(backup)).ok).toBe(true)
    expect(useBank.getState().items[0]!.title).toBe('Kept')
    const { bank: _bank, ...old } = backup
    void _bank
    expect(restoreBackup(JSON.stringify(old)).ok).toBe(true)
    expect(useBank.getState().items).toEqual([])
  })
})
