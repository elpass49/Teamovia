/**
 * @teamovia/agents-sdk
 * Abstractions partagées pour l'exécution des agents Teamovia.
 *
 * Pipeline principal : createAgentRunner
 * Briques atomiques  : embedText, matchKnowledge, writeAgentLog, getAgentMemory, triggerN8nWebhook
 */

export { createAgentRunner }          from './runner'
export type { AgentRunnerOptions,
              AgentRunnerResult }     from './runner'

export { embedText }                  from './embeddings'

export { matchKnowledge,
         formatChunksForPrompt }      from './knowledge'
export type { KnowledgeChunk }        from './knowledge'

export { writeAgentLog }              from './logs'
export type { LogEvent, LogMeta }     from './logs'

export { getAgentMemory,
         updateAgentMemory,
         formatMemoryForPrompt }      from './memory'
export type { AgentMemory }           from './memory'

export { triggerN8nWebhook }          from './n8n'

export { ingestText }                 from './ingest'
export type { IngestResult }          from './ingest'
