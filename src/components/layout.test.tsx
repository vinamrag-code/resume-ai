import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '@/App'
import { useResumes } from '@/store/resumes'
import { useSettings } from '@/store/settings'
import { sampleContent } from '@/test/fixtures'

const setup = (route = '/') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )

beforeEach(() => {
  useResumes.setState({ resumes: [] })
  useSettings.setState({ theme: 'light', onboarded: true })
})

describe('navbar', () => {
  it('puts the profile button at the right end, with Settings inside its menu and not in the main nav', async () => {
    setup()
    const header = screen.getByRole('banner')
    const buttons = header.querySelectorAll('button')
    expect(buttons[buttons.length - 1]).toHaveAccessibleName('Profile')
    expect(buttons[buttons.length - 2]).toHaveAccessibleName(/^Theme:/)
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Profile' }))
    expect(screen.getByRole('menu', { name: 'Profile menu' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shows initials and email from your resume, and closes with Escape', async () => {
    useResumes.getState().create('R', sampleContent())
    setup()
    const profile = screen.getByRole('button', { name: 'Profile' })
    expect(profile).toHaveTextContent('AL')
    await userEvent.click(profile)
    expect(screen.getByRole('menu')).toHaveTextContent('Ada Lovelace')
    expect(screen.getByRole('menu')).toHaveTextContent('ada@example.com')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(profile).toHaveFocus()
  })

  it('closes when clicking outside', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Profile' }))
    await userEvent.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('theme toggle is an icon button that switches between light and dark', async () => {
    setup()
    const toggle = () => screen.getByRole('button', { name: /^Theme:/ })
    expect(toggle()).toHaveAccessibleName('Theme: light. Switch to dark')
    expect(toggle()).not.toHaveTextContent(/theme/i)
    expect(toggle().querySelector('svg')).toBeInTheDocument()
    await userEvent.click(toggle())
    expect(useSettings.getState().theme).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
  })
})

describe('active navigation highlight', () => {
  const current = () => [...screen.getByRole('navigation', { name: 'Main' }).querySelectorAll('a[aria-current="page"]')].map((a) => a.textContent)

  it('highlights Resumes on the list, import page and an open resume (which has no back button)', () => {
    const r = useResumes.getState().create('R', sampleContent())
    const first = setup('/')
    expect(current()).toEqual(['Resumes'])
    first.unmount()
    const second = setup('/import')
    expect(current()).toEqual(['Resumes'])
    second.unmount()
    setup(`/resume/${r.id}`)
    expect(current()).toEqual(['Resumes'])
    expect(screen.queryByRole('link', { name: /← Resumes|back/i })).not.toBeInTheDocument()
  })

  it('highlights Tracker and Cover letters on their pages', () => {
    setup('/tracker').unmount()
    setup('/tracker')
    expect(current()).toEqual(['Tracker'])
  })

  it('highlights Cover letters, and the profile button on Settings', () => {
    setup('/cover')
    expect(current()).toEqual(['Cover letters'])
  })

  it('marks the profile button as current on Settings, with no nav item highlighted', () => {
    setup('/settings')
    expect(current()).toEqual([])
    expect(screen.getByRole('button', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
  })
})
