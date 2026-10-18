import { Document } from '@langchain/core/documents'
import type { EmbeddingsInterface } from '@langchain/core/embeddings'
import { VectorStore } from '@langchain/core/vectorstores'
import { cosine } from '@/lib/ats/embeddings'
import { allChunks, asKind, getDb, listSources } from './db'
import type { ChunkRecord } from './db'
import { hashText } from './loaders'
import { rankChunks } from './rank'
import type { RankOptions } from './rank'

/**
 * A LangChain vector store whose rows live in IndexedDB. A person's data is a handful of documents, so search is a
 * plain cosine scan over the stored vectors rather than an index.
 */
export class IndexedDbVectorStore extends VectorStore {
  declare FilterType: (chunk: ChunkRecord) => boolean

  constructor(embeddings: EmbeddingsInterface) {
    super(embeddings, {})
  }

  _vectorstoreType(): string {
    return 'indexeddb'
  }

  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    // Same contract as the indexer: a passage is identified by its text, so adding it twice just records the source.
    const db = await getDb()
    const tx = db.transaction('chunks', 'readwrite')
    for (const [i, d] of documents.entries()) {
      const header = String(d.metadata.header ?? '')
      const id = hashText(`${header}\n${d.pageContent}`)
      const sourceId = String(d.metadata.sourceId ?? 'manual')
      const have = await tx.store.get(id)
      await tx.store.put(have ? { ...have, sources: [...new Set([...have.sources, sourceId])] } : { id, header, body: d.pageContent, kind: asKind(d.metadata.kind), vector: vectors[i]!, sources: [sourceId] })
    }
    await tx.done
  }

  async addDocuments(documents: Document[]): Promise<void> {
    await this.addVectors(await this.embeddings.embedDocuments(documents.map((d) => `${d.metadata.header ?? ''}\n${d.pageContent}`)), documents)
  }

  async similaritySearchVectorWithScore(query: number[], k: number, filter?: this['FilterType']): Promise<[Document, number][]> {
    const rows = (await allChunks()).filter((c) => c.vector.length === query.length && (!filter || filter(c)))
    return rows
      .map((c): [ChunkRecord, number] => [c, cosine(query, c.vector)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([c, score]) => [toDocument(c), score])
  }

  /** The passages best worth adding to a prompt (see `rankChunks`): deduplicated, varied, and not already in it. */
  async searchForPrompt(query: string, opts: RankOptions): Promise<Document[]> {
    const text = query.slice(0, 2000)
    const [vector, chunks, sources] = await Promise.all([this.embeddings.embedQuery(text), allChunks(), listSources()])
    return rankChunks(chunks, sources, vector, text, opts).map(toDocument)
  }
}

const toDocument = (c: ChunkRecord) => new Document({ pageContent: c.body, metadata: { header: c.header, kind: c.kind, sourceIds: c.sources } })
