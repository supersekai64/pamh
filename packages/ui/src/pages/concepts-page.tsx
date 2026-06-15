import type { ReactNode } from 'react'
import type {
  ApiConceptGraph,
  ApiConceptNode,
  ConceptDepth,
  ContextPreview,
  MapLayout,
} from '@/types'

interface ConceptsPageComponents {
  NeuralMapPanel: (props: {
    conceptDepth: ConceptDepth
    conceptGraph: ApiConceptGraph | null
    focusedConcept: string
    mapLayout: MapLayout
    onClearFocus: () => void
    onConceptDepthChange: (depth: ConceptDepth) => void
    onConceptSelect: (concept: string) => void
    onIgnore: (concept: string) => void
    onMapLayoutChange: (layout: MapLayout) => void
  }) => ReactNode
  ConceptInspector: (props: {
    concept: ApiConceptNode | null
    conceptGraph: ApiConceptGraph | null
    focusedConcept: string
    onConceptSelect: (concept: string) => void
    onConsolidate: (concept: string) => void
    onIgnore: (concept: string) => void
  }) => ReactNode
  ContextMiniPanel: (props: {
    contextPreview: ContextPreview | null
    onOpen: () => void
  }) => ReactNode
}

export function ConceptsPage({
  activeConcept,
  components,
  conceptDepth,
  conceptGraph,
  contextPreview,
  focusedConcept,
  mapLayout,
  onClearFocus,
  onConceptDepthChange,
  onConceptSelect,
  onConsolidate,
  onContextOpen,
  onIgnore,
  onMapLayoutChange,
}: {
  activeConcept: ApiConceptNode | null
  components: ConceptsPageComponents
  conceptDepth: ConceptDepth
  conceptGraph: ApiConceptGraph | null
  contextPreview: ContextPreview | null
  focusedConcept: string
  mapLayout: MapLayout
  onClearFocus: () => void
  onConceptDepthChange: (depth: ConceptDepth) => void
  onConceptSelect: (concept: string) => void
  onConsolidate: (concept: string) => void
  onContextOpen: () => void
  onIgnore: (concept: string) => void
  onMapLayoutChange: (layout: MapLayout) => void
}) {
  const { ConceptInspector, ContextMiniPanel, NeuralMapPanel } = components

  return (
    <div className="grid gap-4">
      <NeuralMapPanel
        conceptDepth={conceptDepth}
        conceptGraph={conceptGraph}
        focusedConcept={focusedConcept}
        mapLayout={mapLayout}
        onClearFocus={onClearFocus}
        onConceptDepthChange={onConceptDepthChange}
        onConceptSelect={onConceptSelect}
        onIgnore={onIgnore}
        onMapLayoutChange={onMapLayoutChange}
      />
      <section className="grid grid-cols-[minmax(20rem,0.78fr)_minmax(24rem,1fr)] gap-4 max-xl:grid-cols-1">
        <ConceptInspector
          concept={activeConcept}
          conceptGraph={conceptGraph}
          focusedConcept={focusedConcept}
          onConceptSelect={onConceptSelect}
          onConsolidate={onConsolidate}
          onIgnore={onIgnore}
        />
        <ContextMiniPanel contextPreview={contextPreview} onOpen={onContextOpen} />
      </section>
    </div>
  )
}
