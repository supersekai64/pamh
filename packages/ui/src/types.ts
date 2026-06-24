export type Store = 'project'

export type MemoryType =
  | 'decision'
  | 'knowledge'
  | 'mistake'
  | 'rule'
  | 'preference'
  | 'session'
  | 'exchange'
  | 'task'
  | 'client'
  | 'pattern'

export type MemoryStatus = 'active' | 'deleted' | 'archived' | 'proposed' | 'noise'
export type MemoryStatusFilter = MemoryStatus | 'all'
export type AutoCaptureMode = 'auto' | 'assisted' | 'manual'

export interface MemoryMetadata {
  id: string
  title?: string
  type: MemoryType
  scope: string
  status: MemoryStatus
  theme?: string
  created_at: string
  updated_at: string
  tags: string[]
  concepts?: string[]
  source: string
  supersedes?: string
  superseded_by?: string
  source_ids?: string[]
  salience?: number
  access_count?: number
  last_accessed_at?: string
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
  status: string
  updated_at: string
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
  activeMemoryCount: number
  sources: ContextSource[]
  topConcepts: Array<{ title: string; occurrences: number; score: number }>
  generatedAt: string
  exclusions: ContextExclusion[]
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

export interface IndexDiagnosticsResponse {
  database: {
    sizeBytes: number
    files: Array<{ name: string; sizeBytes: number }>
  }
  sqlite: {
    memoryRows: number
    tagRows: number
    chunkRows: number
    ftsRows: number
    latestMemoryUpdatedAt: string | null
  }
  markdown: {
    memoryFiles: number
  }
  vectors: {
    candidates: number
    indexed: number
    missing: number
    coverage: number
    latestUpdatedAt: string | null
  }
  health: {
    status: 'ok' | 'needs-sync' | 'unknown'
    missingInIndex: number
    orphanedInIndex: number
    missingVectors: number
  }
}

export interface PamConfigResponse {
  project: {
    name: string
    path: string
    memoryPath: string
  }
  autoCapture: {
    mode: AutoCaptureMode
  }
  noise: {
    ignoredConcepts: string[]
  }
  runtime: {
    autoVectorize: boolean
    deferThemeRebuild: boolean
    debug: boolean
  }
}

export type PackageVersionStatus = 'up-to-date' | 'update-available' | 'ahead' | 'unknown'

export interface PackageBuildVersion {
  name: string
  label: string
  currentVersion: string | null
  latestVersion: string | null
  status: PackageVersionStatus
  error?: string
}

export interface PackageVersionsResponse {
  packages: PackageBuildVersion[]
  checkedAt: string
  updateCount: number
}
