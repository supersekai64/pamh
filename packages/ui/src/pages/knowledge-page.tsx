import type { ReactNode } from 'react'
import type { KnowledgeGraphResponse, Memory, SearchResult } from '@/types'

export function KnowledgePage({
  KnowledgeGraphPanel,
  directory,
  graph,
  onEvidence,
}: {
  KnowledgeGraphPanel: (props: {
    directory: Map<string, Memory | SearchResult>
    graph: KnowledgeGraphResponse | null
    onEvidence: (id: string) => void
  }) => ReactNode
  directory: Map<string, Memory | SearchResult>
  graph: KnowledgeGraphResponse | null
  onEvidence: (id: string) => void
}) {
  return <KnowledgeGraphPanel directory={directory} graph={graph} onEvidence={onEvidence} />
}
