export { VERSION } from './version.js'
export * from './types.js'
export { generateId } from './id.js'
export { parseMarkdown, serializeMarkdown } from './markdown.js'
export {
  getGlobalMemoryPath,
  getProjectMemoryPath,
  findMemoryBase,
  initGlobalMemory,
  initProjectMemory,
  createMemory,
  readMemory,
  updateMemory,
  deleteMemory,
  archiveMemory,
  listMemories,
  indexAllMemories,
  checkIndexConsistency,
  findMemoryFile,
  type ConsistencyReport,
  GLOBAL_SUBDIRS,
  type DeleteMemoryOptions,
} from './storage.js'
export { MemoryIndex, type SearchOptions, type SearchResult, type IndexStats } from './indexer.js'
export { loadMemoryIgnore, getDefaultIgnorePatterns, type MemoryIgnore } from './memoryignore.js'
export { redactContent, getRedactionPatterns, type RedactionResult } from './redaction.js'
export { restoreMemory } from './restore.js'
export { approveMemory, rejectMemory } from './approve.js'
export {
  loadAutoCaptureConfig,
  saveAutoCaptureConfig,
  initAutoCaptureConfig,
  type AutoCaptureMode,
  type AutoCaptureConfig,
  type AutoCaptureRule,
} from './auto-capture.js'
export { exportMemories, type ExportFormat, type ExportOptions } from './export.js'
export {
  importMemories,
  type ImportFormat,
  type ImportOptions,
  type ImportResult,
} from './import.js'
export {
  compileContext,
  writeCompiledContext,
  type CompileContextOptions,
  type CompiledContext,
} from './context.js'
export {
  createEmbeddingProvider,
  LocalEmbeddingProvider,
  OpenAIEmbeddingProvider,
  type EmbeddingProvider,
} from './embedding.js'
export { SemanticIndex, type SemanticSearchResult } from './semantic.js'
export {
  configureProjectIntegrations,
  type ConfigureProjectIntegrationsResult,
  type IntegrationResult,
} from './integrations.js'
export { supersedeMemory, getSupersessionChain, getLatestVersion } from './supersession.js'
export {
  beginHandoff,
  acceptHandoff,
  getOpenHandoff,
  listHandoffs,
  expireOldHandoffs,
} from './handoff.js'
export { calculateDecayScore, recordAccess, forgetSweep, type DecayConfig } from './decay.js'
export {
  recordHookEvent,
  getSessionEvents,
  getRecentEvents,
  type HookEvent,
  type HookEventType,
} from './hooks.js'
export {
  analyzeCleanup,
  analyzeDistillation,
  applyDistillationProposal,
  applyRecommendation,
  buildKnowledgeGraph,
  deferRecommendation,
  generateRecommendations,
  listRecommendations,
  rejectRecommendation,
  seedIntelligenceEvaluationDataset,
  type ApplyRecommendationOptions,
  type CleanupAction,
  type CleanupRecommendation,
  type DistillationProposal,
  type IntelligenceMetrics,
  type KnowledgeEntity,
  type KnowledgeGraph,
  type KnowledgeRelation,
  type MemoryMaintenanceReport,
  type MemoryRecommendation,
  type RecommendationStatus,
  type RecommendationType,
} from './intelligence.js'
export {
  getMemoryDebugStatus,
  recordMemoryDebugEvent,
  setMemoryDebugMode,
  summarizeMemoryForDebug,
  type MemoryDebugConfig,
  type MemoryDebugEvent,
  type MemoryDebugStatus,
} from './memory-debug.js'
