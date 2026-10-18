import { Embeddings } from '@langchain/core/embeddings'
import type { EmbeddingsParams } from '@langchain/core/embeddings'
import { createTransformersEmbedder } from '@/lib/ats/embeddings'
import type { Embedder } from '@/lib/ats/embeddings'

/** LangChain `Embeddings` over the in-browser MiniLM model the ATS score already uses (no API calls, no cost). */
export class BrowserEmbeddings extends Embeddings {
  constructor(private readonly embedder: Embedder = createTransformersEmbedder(), params: EmbeddingsParams = {}) {
    super(params)
  }
  embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.length ? this.embedder.embed(texts) : Promise.resolve([])
  }
  async embedQuery(text: string): Promise<number[]> {
    return (await this.embedder.embed([text]))[0] ?? []
  }
}
