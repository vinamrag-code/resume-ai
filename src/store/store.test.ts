import { beforeEach, describe, expect, it } from 'vitest'
import { sampleContent } from '@/test/fixtures'
import { createBackup, restoreBackup } from './backup'
import { useCoverLetters } from './coverLetters'
import { moveJob, useJobs } from './jobs'
import { useResumes } from './resumes'
import { useSettings } from './settings'
import type { Job } from '@/types/job'

beforeEach(() => {
  useResumes.setState({ resumes: [] })
  useJobs.setState({ jobs: [] })
  useCoverLetters.setState({ letters: [] })
})

describe('resume store', () => {
  it('creates, renames, duplicates and deletes', () => {
    const r = useResumes.getState().create('Main', sampleContent())
    useResumes.getState().rename(r.id, 'Renamed')
    expect(useResumes.getState().resumes[0]!.name).toBe('Renamed')
    const copy = useResumes.getState().duplicate(r.id)!
    expect(copy.id).not.toBe(r.id)
    expect(copy.content).toEqual(r.content)
    expect(useResumes.getState().resumes).toHaveLength(2)
    useResumes.getState().remove(r.id)
    expect(useResumes.getState().resumes.map((x) => x.id)).toEqual([copy.id])
  })

  it('updateContent edits a draft and bumps updatedAt', async () => {
    const r = useResumes.getState().create('Main', sampleContent())
    await new Promise((res) => setTimeout(res, 2))
    useResumes.getState().updateContent(r.id, (d) => ({ ...d, summary: 'New' }))
    const after = useResumes.getState().resumes[0]!
    expect(after.content.summary).toBe('New')
    expect(after.updatedAt).toBeGreaterThan(r.updatedAt)
  })

  it('tailored copies never overwrite the original', () => {
    const base = useResumes.getState().create('Base', sampleContent())
    const edited = { ...sampleContent(), summary: 'Tailored summary' }
    const copy = useResumes.getState().createTailoredCopy(base.id, edited, 'Base - Acme', 'job1')!
    const stored = useResumes.getState().resumes
    expect(stored).toHaveLength(2)
    expect(stored.find((r) => r.id === base.id)!.content.summary).toBe(sampleContent().summary)
    expect(copy.baseResumeId).toBe(base.id)
    expect(copy.jobId).toBe('job1')
  })

  it('persists to localStorage', () => {
    useResumes.getState().create('Persisted')
    expect(localStorage.getItem('resume-ai:resumes')).toContain('Persisted')
  })
})

const job = (id: string, status: Job['status'], order: number): Job => ({
  id, title: id, company: 'C', url: '', date: '2026-01-01', status, notes: '', description: '', createdAt: 0, order,
})

describe('jobs', () => {
  it('moveJob reorders within and across columns with contiguous order', () => {
    const jobs = [job('a', 'saved', 0), job('b', 'saved', 1), job('c', 'applied', 0)]
    const moved = moveJob(jobs, 'a', 'applied', 0)
    const applied = moved.filter((j) => j.status === 'applied').sort((x, y) => x.order - y.order)
    expect(applied.map((j) => j.id)).toEqual(['a', 'c'])
    expect(moved.filter((j) => j.status === 'saved').map((j) => [j.id, j.order])).toEqual([['b', 0]])
    expect(moveJob(jobs, 'nope', 'offer', 0)).toBe(jobs)
  })

  it('store add / update / move / remove', () => {
    const j = useJobs.getState().add({ title: 'Dev', company: 'Acme' })
    expect(j.status).toBe('saved')
    useJobs.getState().update(j.id, { notes: 'call Monday' })
    useJobs.getState().move(j.id, 'interviewing', 0)
    expect(useJobs.getState().jobs[0]).toMatchObject({ status: 'interviewing', notes: 'call Monday' })
    useJobs.getState().remove(j.id)
    expect(useJobs.getState().jobs).toHaveLength(0)
  })
})

describe('backup', () => {
  it('round-trips all data', () => {
    const r = useResumes.getState().create('Main', sampleContent())
    useJobs.getState().add({ title: 'Dev', company: 'Acme', resumeId: r.id })
    useCoverLetters.getState().add({ title: 'L', resumeId: r.id, tone: 'formal', jobTitle: '', company: '', jobDescription: '', body: 'Hi' })
    const json = JSON.stringify(createBackup())
    useResumes.setState({ resumes: [] })
    useJobs.setState({ jobs: [] })
    useCoverLetters.setState({ letters: [] })
    const res = restoreBackup(json)
    expect(res).toEqual({ ok: true, counts: { resumes: 1, jobs: 1, letters: 1 } })
    expect(useResumes.getState().resumes[0]!.name).toBe('Main')
  })

  it('rejects bad input without touching data', () => {
    useResumes.getState().create('Keep me')
    expect(restoreBackup('{nope')).toMatchObject({ ok: false })
    expect(restoreBackup('{"app":"other"}')).toMatchObject({ ok: false })
    expect(useResumes.getState().resumes).toHaveLength(1)
  })

  it('settings update', () => {
    useSettings.getState().update({ model: 'mistral' })
    expect(useSettings.getState().model).toBe('mistral')
  })
})
