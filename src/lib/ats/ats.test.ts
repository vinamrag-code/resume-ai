import { describe, expect, it } from 'vitest'
import { sampleContent, SAMPLE_JD } from '@/test/fixtures'
import { emptyContent } from '@/lib/resume'
import { analyzeBullet } from './bullets'
import { chunkText, cosine, semanticSimilarity, similarityToScore } from './embeddings'
import type { Embedder } from './embeddings'
import { extractKeywords, matchKeywords, stem } from './keywords'
import { BASE_WEIGHTS, computeAtsScore } from './score'

describe('keyword extraction', () => {
  it('finds technical terms and ignores filler words', () => {
    const terms = extractKeywords(SAMPLE_JD).map((k) => k.term)
    expect(terms).toEqual(expect.arrayContaining(['react', 'typescript', 'graphql', 'docker']))
    expect(terms).not.toContain('the')
    expect(terms).not.toContain('experience')
  })

  it('ranks repeated tech terms first', () => {
    expect(extractKeywords(SAMPLE_JD)[0]?.term).toBe('react')
  })

  it('is deterministic', () => {
    expect(extractKeywords(SAMPLE_JD)).toEqual(extractKeywords(SAMPLE_JD))
  })

  it('stems simple inflections', () => {
    expect(stem('managed')).toBe(stem('managing'))
    expect(stem('apis')).toBe(stem('api'))
  })

  it('matches stemmed keywords and reports missing ones', () => {
    const m = matchKeywords([{ term: 'testing', weight: 1 }, { term: 'kubernetes', weight: 1 }], 'Wrote unit tests for services')
    expect(m.matched.map((k) => k.term)).toEqual(['testing'])
    expect(m.missing.map((k) => k.term)).toEqual(['kubernetes'])
    expect(m.coverage).toBeCloseTo(0.5)
  })
})

describe('bullet analysis', () => {
  it('rewards action verb, metric and good length', () => {
    const a = analyzeBullet('Reduced page load time by 35% by introducing code splitting and caching')
    expect(a.startsWithVerb && a.hasMetric && a.lengthOk).toBe(true)
    expect(a.score).toBe(100)
  })
  it('flags weak bullets with issues', () => {
    const a = analyzeBullet('worked on APIs')
    expect(a.score).toBeLessThan(40)
    expect(a.issues.length).toBeGreaterThanOrEqual(2)
  })
})

describe('ATS score', () => {
  it('is deterministic and bounded', () => {
    const input = { content: sampleContent(), jobDescription: SAMPLE_JD, semanticSimilarity: 0.5 }
    const a = computeAtsScore(input)
    expect(computeAtsScore(input)).toEqual(a)
    expect(a.overall).toBeGreaterThanOrEqual(0)
    expect(a.overall).toBeLessThanOrEqual(100)
  })

  it('overall equals the weighted sum of its components', () => {
    const r = computeAtsScore({ content: sampleContent(), jobDescription: SAMPLE_JD, semanticSimilarity: 0.5 })
    expect(r.components.map((c) => c.id).sort()).toEqual(['bullets', 'completeness', 'formatting', 'keywords', 'semantic'])
    expect(r.components.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1)
    expect(r.overall).toBe(Math.round(r.components.reduce((s, c) => s + c.score * c.weight, 0)))
    expect(r.components.find((c) => c.id === 'keywords')?.weight).toBeCloseTo(BASE_WEIGHTS.keywords)
  })

  it('lists missing keywords and fixes when a job description is given', () => {
    const r = computeAtsScore({ content: sampleContent(), jobDescription: SAMPLE_JD })
    expect(r.missingKeywords.map((k) => k.term)).toContain('graphql')
    expect(r.fixes.some((f) => f.includes('graphql'))).toBe(true)
    expect(r.semanticPending).toBe(true)
  })

  it('skips job-dependent components without a job description and renormalises', () => {
    const r = computeAtsScore({ content: sampleContent() })
    expect(r.components.map((c) => c.id).sort()).toEqual(['bullets', 'completeness', 'formatting'])
    expect(r.components.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1)
    expect(r.hasJobDescription).toBe(false)
  })

  it('scores an empty resume low and explains why', () => {
    const r = computeAtsScore({ content: emptyContent() })
    expect(r.overall).toBeLessThan(40)
    expect(r.completeness.filter((c) => !c.passed).length).toBeGreaterThan(5)
    expect(r.fixes.length).toBeGreaterThan(0)
  })

  it('flags emoji in formatting checks', () => {
    const c = sampleContent()
    c.summary += ' 🚀'
    const r = computeAtsScore({ content: c })
    expect(r.formatting.find((x) => x.label.includes('icons'))?.passed).toBe(false)
  })
})

describe('embeddings helpers', () => {
  it('computes cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })
  it('maps similarity to a clamped score', () => {
    expect(similarityToScore(0)).toBe(0)
    expect(similarityToScore(1)).toBe(100)
    expect(similarityToScore(0.425)).toBe(50)
  })
  it('chunks long text', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} has a few words in it.`).join(' ')
    const chunks = chunkText(text, 30)
    expect(chunks.length).toBeGreaterThan(5)
  })
  it('computes semantic similarity with an injected embedder', async () => {
    const embedder: Embedder = {
      embed: async (texts) => texts.map((t) => (t.includes('react') ? [1, 0] : [0, 1])),
    }
    expect(await semanticSimilarity(embedder, 'I know react.', 'Needs react.')).toBeCloseTo(1)
    expect(await semanticSimilarity(embedder, 'I know cooking.', 'Needs react.')).toBeCloseTo(0)
  })
})
