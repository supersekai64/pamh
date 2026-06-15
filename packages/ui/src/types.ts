import type { Vector3 } from 'three'

export type Store = 'project'
export type WorkspaceView =
  | 'dashboard'
  | 'map'
  | 'evidence'
  | 'context'
  | 'governance'
  | 'knowledge'
export type MapLayout = '2d' | '3d'
export type ConceptDepth = 'top' | 'expanded'
export type MemoryAction =
  | 'archive'
  | 'restore'
  | 'delete'
  | 'physical-delete'
  | 'approve'
  | 'reject'
  | 'mark-noise'

export interface MemoryMetadata {
  id: string
  type: string
  scope: string
  status: string
  created_at: string
  updated_at: string
  tags: string[]
  source: string
  salience?: number
}

export interface Memory {
  metadata: MemoryMetadata
  content: string
}

export interface SearchResult extends MemoryMetadata {
  content: string
  file_path: string
}

export interface Stats {
  total: number
  active: number
  deleted: number
  archived: number
  proposed: number
  noise: number
  byType: Record<string, number>
  byScope: Record<string, number>
  tags: Record<string, number>
}

export interface StatsResponse {
  project: {
    name: string
    path: string
    memoryPath: string
  }
  stats: Stats
  rawStats: Stats
  rawTotalMemories: number
  excludedNoiseMemories: number
}

export interface MemoriesResponse {
  memories: Array<Memory | SearchResult>
  totalMatching: number
  rawTotalMemories: number
  excludedNoiseMemories: number
}

export interface ApiConceptSample {
  id: string
  type: string
  scope: string
  status: string
  source: string
  created_at: string
  updated_at: string
  tags: string[]
  content: string
}

export interface ContextSource extends ApiConceptSample {
  section: string
  reasons: string[]
}

export interface ContextExclusion {
  id: string
  type: string
  reason: string
}

export interface ApiConceptNode {
  id: string
  title: string
  category: 'tag' | 'keyword'
  rank: number
  score: number
  occurrences: number
  searchTerm: string
  evidence: string[]
  samples: ApiConceptSample[]
  typeCounts: Record<string, number>
  scopeCounts: Record<string, number>
  sourceCounts: Record<string, number>
  lastUpdated: string | null
}

export interface ApiConceptEdge {
  source: string
  target: string
  weight: number
}

export interface ApiConceptGraph {
  totalMemories: number
  rawTotalMemories: number
  excludedNoiseMemories: number
  ignoredConcepts: string[]
  calculation: string
  concepts: ApiConceptNode[]
  edges: ApiConceptEdge[]
  exclusions: ContextExclusion[]
}

export interface ContextPreview {
  content: string
  tokenEstimate: number
  memoryCount: number
  sources: ContextSource[]
  topConcepts: Array<{ title: string; occurrences: number; score: number }>
  generatedAt: string
  exclusions: ContextExclusion[]
}

export interface MemoryRecommendation {
  id: string
  type: string
  status: string
  title: string
  explanation: string
  evidence_ids: string[]
  action?: string
  payload?: {
    source_ids?: string[]
    target_id?: string
    replacement_id?: string
    left_id?: string
    right_id?: string
    concept?: string
    count?: number
    compression_ratio?: number
  }
}

export interface RecommendationsResponse {
  recommendations: MemoryRecommendation[]
  metrics: {
    total_memories: number
    active_memories: number
    proposed_recommendations: number
    source_preservation_rate: number
    top_concept_count: number
  }
}

export interface KnowledgeEntity {
  id: string
  label: string
  type: string
  evidence_ids: string[]
}

export interface KnowledgeRelation {
  id: string
  source: string
  target: string
  type: string
  evidence_ids: string[]
  explanation: string
}

export interface KnowledgeGraphResponse {
  entities: KnowledgeEntity[]
  relations: KnowledgeRelation[]
  metrics: {
    entity_count: number
    relation_count: number
    evidence_coverage: number
  }
}

export interface GraphDatum {
  id: string
  title: string
  category: 'tag' | 'keyword'
  color: number
  radius: number
  position: Vector3
  searchTerm: string
  score: number
  occurrences: number
  labelVisible: boolean
  detailHtml: string
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
}

export interface ConceptGraph {
  nodes: GraphDatum[]
  edges: GraphEdge[]
  maxEdgeWeight: number
}
