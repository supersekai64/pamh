# Intelligence Layer

PAMH includes an assisted intelligence layer for memory maintenance. It is
deterministic first: recommendations, cleanup, distillation, and graph previews
are generated from local memory signals before any optional LLM enrichment.

## Foundations

Markdown memories remain the source of truth. SQLite remains the index/query
layer.

Synthetic memories and graph relations preserve evidence through `source_ids`
or `evidence_ids`. This lets the user inspect why a recommendation, distilled
memory, or relation exists.

Important boundaries:

- Observations are append-only hook/debug records.
- Recommendations are review objects and do not mutate memory by themselves.
- Memories are durable Markdown records.
- Knowledge Graph relations are generated as proposed, evidence-backed edges.

## Recommendations

Generate reviewable maintenance recommendations:

```bash
memory intelligence recommend --project
```

List stored recommendations:

```bash
memory intelligence list --project
```

Apply, reject, or defer one recommendation:

```bash
memory intelligence apply <id> --project
memory intelligence reject <id> --project
memory intelligence defer <id> --project
```

Recommendation types include:

- `distill_candidates`
- `obsolete_candidate`
- `noise_candidate`
- `strong_concept`
- `contradiction`
- `metadata_fix`
- `missing_memory`

Rejected recommendations are stored so they do not immediately reappear without
new evidence.

## Cleanup

Preview grouped cleanup recommendations:

```bash
memory intelligence cleanup --project
```

Supported actions include:

- `archive`
- `mark_noise`
- `merge_or_distill`
- `restore`
- `physical_delete`

Physical delete requires explicit confirmation when applied. Reversible actions
use normal memory status changes.

## Distillation

Preview repeated concepts that can become synthetic memories:

```bash
memory intelligence distill --project
```

Create proposed distilled memories:

```bash
memory intelligence distill --project --apply
```

Distilled memories use `source: distillation`, default to `status: proposed`,
and preserve all evidence memory IDs in `source_ids`.

## Knowledge Graph

Preview explicit entities and typed relations:

```bash
memory intelligence graph --project
```

Entities include concepts, decisions, rules, files, projects, stacks, APIs,
tools, mistakes, features, and memories.

Relation types include:

- `depends_on`
- `supersedes`
- `contradicts`
- `mentions`
- `implements`
- `owned_by`
- `uses`
- `caused_by`
- `resolved_by`
- `applies_to`
- `excludes_from`

Every generated relation carries evidence IDs. In assisted mode, generated graph
relations remain reviewable previews rather than permanent mutations.

## Evaluation Dataset

Seed the shared intelligence evaluation dataset:

```bash
memory intelligence seed-eval --project
```

The dataset creates 270 memories covering active memories, near duplicates,
obsolete decisions, noise candidates, contradictions, recurring concepts, and
verifiable graph relations.

Use this corpus for repeatable core, CLI, API, MCP, and UI tests.

## API And MCP

The local API exposes:

- `GET /api/recommendations`
- `POST /api/recommendations/:id/apply`
- `POST /api/recommendations/:id/reject`
- `POST /api/recommendations/:id/defer`
- `GET /api/distillation`
- `POST /api/distillation/apply`
- `GET /api/knowledge-graph`
- `POST /api/intelligence/evaluation-dataset`

The MCP server exposes preview tools for recommendations, distillation, and the
Knowledge Graph, plus a tool for applying a reviewed recommendation.
