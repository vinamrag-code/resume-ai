import { emptyContent } from '@/lib/resume'
import type { ResumeContent } from '@/types/resume'

export function sampleContent(): ResumeContent {
  return {
    ...emptyContent(),
    contact: { name: 'Ada Lovelace', email: 'ada@example.com', phone: '555-0100', location: 'London, UK', links: [] },
    summary: 'Software engineer with five years of experience building reliable web applications and mentoring junior developers.',
    experience: [
      {
        id: 'e1',
        company: 'Analytical Co',
        title: 'Software Engineer',
        location: 'London',
        start: 'Jun 2020',
        end: 'Present',
        bullets: [
          'Built a React dashboard used by 40 internal analysts every day',
          'worked on APIs',
          'Reduced page load time by 35% by introducing code splitting and caching',
        ],
      },
    ],
    education: [{ id: 'd1', school: 'University of London', degree: 'BSc', field: 'Mathematics', start: '2016', end: '2020', details: [] }],
    projects: [{ id: 'p1', name: 'Engine Sim', link: '', bullets: ['Developed a TypeScript simulator for mechanical computation'] }],
    skills: ['TypeScript', 'React', 'Node.js', 'SQL', 'Docker'],
    certifications: [],
  }
}

export const SAMPLE_JD = `We are hiring a Frontend Engineer to build React and TypeScript applications.
You will design reusable components, write unit tests with Jest, and work with GraphQL APIs.
Experience with CI/CD, Docker and accessibility is a plus. React expertise is essential.`
