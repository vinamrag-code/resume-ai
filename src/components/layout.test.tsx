import { render, screen, within } from '@testing-library/react'
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
  it('puts the profile and theme buttons at the bottom of the sidebar, with Settings inside the profile menu and not in the main nav', async () => {
    setup()
    const aside = screen.getByRole('navigation', { name: 'Main' }).closest('aside')!
    const buttons = aside.querySelectorAll('button')
    expect(buttons[buttons.length - 2]).toHaveAccessibleName(/^Theme:/)
    expect(buttons[buttons.length - 1]).toHaveAccessibleName('Profile')
    expect(buttons[0]).toHaveAccessibleName('Collapse sidebar')
    expect(screen.getByRole('banner')).not.toContainElement(screen.getByRole('button', { name: 'Profile' }))
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Profile' }))
    expect(screen.getByRole('menu', { name: 'Profile menu' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('collapses and expands the sidebar, showing the full name only when expanded', async () => {
    localStorage.removeItem('sidebar-collapsed')
    useResumes.getState().create('R', sampleContent())
    setup()
    const profile = () => screen.getByRole('button', { name: 'Profile' })
    expect(profile()).toHaveTextContent('Ada Lovelace')
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(screen.getByText('Ada Lovelace')).toHaveClass('opacity-0')
    expect(localStorage.getItem('sidebar-collapsed')).toBe('1')
    await userEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(profile()).toHaveTextContent('Ada Lovelace')
    localStorage.removeItem('sidebar-collapsed')
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

  it('highlights Dashboard on the home page', () => {
    setup('/')
    expect(current()).toEqual(['Dashboard'])
  })

  it('highlights Resumes on the list, import page and an open resume, which has a back button to the list', () => {
    const r = useResumes.getState().create('R', sampleContent())
    const first = setup('/resumes')
    expect(current()).toEqual(['Resumes'])
    first.unmount()
    const second = setup('/import')
    expect(current()).toEqual(['Resumes'])
    second.unmount()
    setup(`/resume/${r.id}`)
    expect(current()).toEqual(['Resumes'])
    expect(screen.getByRole('link', { name: 'Back to resumes' })).toHaveAttribute('href', '/resumes')
  })

  it('has the navigation in a left sidebar, and a menu button for small screens', async () => {
    setup()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav.closest('aside')).toBeInTheDocument()
    expect(screen.getByRole('banner')).not.toContainElement(nav)
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const menu = screen.getByRole('complementary', { name: 'Menu' })
    await userEvent.click(within(menu).getByRole('link', { name: 'Tracker' }))
    expect(screen.queryByRole('complementary', { name: 'Menu' })).not.toBeInTheDocument()
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
