import type { ReactNode } from 'react'
import type {
  ApiConceptGraph,
  Memory,
  RecommendationsResponse,
  SearchResult,
  StatsResponse,
} from '@/types'

export function GovernancePage({
  GovernancePanel,
  conceptGraph,
  directory,
  includeNoise,
  onEvidenceSelect,
  onIncludeNoiseChange,
  onPreferContradiction,
  onRecommendationAction,
  recommendations,
  statsResponse,
}: {
  GovernancePanel: (props: {
    conceptGraph: ApiConceptGraph | null
    directory: Map<string, Memory | SearchResult>
    includeNoise: boolean
    onEvidenceSelect: (id: string) => void
    onIncludeNoiseChange: (includeNoise: boolean) => void
    onPreferContradiction: (id: string, preferredId: string) => void
    onRecommendationAction: (id: string, action: 'apply' | 'reject' | 'defer') => void
    recommendations: RecommendationsResponse | null
    statsResponse: StatsResponse | null
  }) => ReactNode
  conceptGraph: ApiConceptGraph | null
  directory: Map<string, Memory | SearchResult>
  includeNoise: boolean
  onEvidenceSelect: (id: string) => void
  onIncludeNoiseChange: (includeNoise: boolean) => void
  onPreferContradiction: (id: string, preferredId: string) => void
  onRecommendationAction: (id: string, action: 'apply' | 'reject' | 'defer') => void
  recommendations: RecommendationsResponse | null
  statsResponse: StatsResponse | null
}) {
  return (
    <GovernancePanel
      conceptGraph={conceptGraph}
      directory={directory}
      includeNoise={includeNoise}
      onEvidenceSelect={onEvidenceSelect}
      onIncludeNoiseChange={onIncludeNoiseChange}
      onPreferContradiction={onPreferContradiction}
      onRecommendationAction={onRecommendationAction}
      recommendations={recommendations}
      statsResponse={statsResponse}
    />
  )
}
