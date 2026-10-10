import { describe, expect, it } from 'vitest'
import { Packer } from 'docx'
import { moveItem, removeAt, replaceAt } from './arrays'
import { buildLetterDocx } from './export/coverLetterDocx'
import { buildResumeDocx } from './export/docx'
import { safeFilename } from './export/download'
import { joinPdfItems } from './extract'
import { sampleContent } from '@/test/fixtures'
import { chatSystemPrompt } from './prompts'
import { coverLetterPrompt, parseResumePrompt, tailorPrompt, TRUTHFULNESS_RULES } from './prompts'
import { parseEdits, visibleText } from '@/features/chat/chatLogic'
import { newResume } from './resume'


describe('array helpers', () => {
  it('moves, removes and replaces immutably', () => {
    const a = [1, 2, 3]
    expect(moveItem(a, 0, 2)).toEqual([2, 3, 1])
    expect(moveItem(a, 0, 5)).toBe(a)
    expect(removeAt(a, 1)).toEqual([1, 3])
    expect(replaceAt(a, 1, 9)).toEqual([1, 9, 3])
    expect(a).toEqual([1, 2, 3])
  })
})

describe('pdf text joining', () => {
  it('uses end-of-line hints and spaces', () => {
    expect(joinPdfItems([{ str: 'Hello' }, { str: 'World', hasEOL: true }, { str: 'Next', hasEOL: true }])).toBe('Hello World\nNext')
  })
})

describe('DOCX export', () => {
  it('produces a valid zip (docx) for resume and letter', async () => {
    const resume = await Packer.toBuffer(buildResumeDocx(sampleContent(), { fontSize: 10.5, spacing: 1, headerAlign: 'auto' as const, bulletIndent: 1.1 }, 'modern'))
    const letter = await Packer.toBuffer(buildLetterDocx('Dear team,\n\nHello.\n\nBest,\nAda'))
    for (const buf of [resume, letter]) {
      expect(buf.length).toBeGreaterThan(1000)
      expect(buf.subarray(0, 2).toString()).toBe('PK')
    }
  })
  it('builds safe filenames', () => {
    expect(safeFilename('My résumé: v2/final?', 'docx')).toBe('My-rsum-v2final.docx')
    expect(safeFilename('   ', 'pdf')).toBe('resume.pdf')
  })
})

describe('prompts', () => {
  it('include the truthfulness rules in every prompt that touches resume content', () => {
    const sys = [
      parseResumePrompt('x')[0]!.content,
      tailorPrompt({ resumeJson: '{}', jobTitle: '', company: '', jobDescription: 'jd' })[0]!.content,
      chatSystemPrompt({ resumeJson: '{}', jobTitle: '', company: '', jobDescription: '' }).content,
      coverLetterPrompt({ resumeText: 'r', jobTitle: '', company: '', jobDescription: 'jd', tone: 'concise', candidateName: 'A' })[0]!.content,
    ]
    for (const s of sys) expect(s).toContain(TRUTHFULNESS_RULES)
  })
})

describe('chat edit parsing', () => {
  const content = sampleContent()
  const resume = newResume('x', content)
  it('hides the edits block, even while it is still streaming', () => {
    expect(visibleText('Here you go.\n<edits>{"bul')).toBe('Here you go.')
  })
  it('parses valid edits and ignores garbage', () => {
    const raw = 'ok <edits>{"bullets":[{"section":"experience","entry":0,"bullet":1,"text":"Maintained APIs for analysts"}]}</edits>'
    const changes = parseEdits(raw, resume)
    expect(changes).toHaveLength(1)
    expect(changes[0]!.before).toBe('worked on APIs')
    expect(parseEdits('<edits>not json</edits>', resume)).toEqual([])
    expect(parseEdits('no block', resume)).toEqual([])
  })
})
