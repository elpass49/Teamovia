# Prompts système Teamovia — Guide d'utilisation

## Structure

```
packages/prompts/
├── agent-support.system.md   Prompt système agent support client
├── agent-sales.system.md     Prompt système agent ventes / qualification
└── README.md                 Ce fichier
```

## Variables d'injection

Les variables `{{VARIABLE}}` sont remplacées par le backend avant l'appel LLM.
Elles ne doivent jamais apparaître telles quelles dans un prompt envoyé au modèle.

| Variable | Source | Agent(s) |
|---|---|---|
| `{{COMPANY_NAME}}` | `workspaces.name` | Support · Ventes |
| `{{WORKSPACE_ID}}` | Session auth | Support · Ventes |
| `{{CHANNEL}}` | `sessions.channel` | Support |
| `{{CURRENT_DATETIME}}` | `new Date().toISOString()` | Support · Ventes |
| `{{TICKET_STATUS}}` | `support_tickets.status` | Support |
| `{{AGENT_MEMORY}}` | `agent_memory.facts + preferences` | Support |
| `{{KB_CHUNKS}}` | RPC `match_knowledge_chunks()` | Support · Ventes |
| `{{ESCALATION_TEAM}}` | `workspaces.escalation_config` | Support |
| `{{LEAD_SOURCE}}` | `leads.source` | Ventes |
| `{{LEAD_STATUS}}` | `leads.status` | Ventes |
| `{{LEAD_SCORE}}` | `leads.score` | Ventes |
| `{{HANDOFF_CONTEXT}}` | `sessions.shared_context` | Ventes |
| `{{LEAD_MEMORY}}` | `agent_memory` pour l'agent ventes | Ventes |

## Fonction d'injection (TypeScript)

```typescript
// packages/prompts/inject.ts
import fs from 'fs'
import path from 'path'

export function buildSystemPrompt(
  agentName: 'support' | 'sales',
  variables: Record<string, string | undefined>
): string {
  const raw = fs.readFileSync(
    path.join(__dirname, `agent-${agentName}.system.md`),
    'utf-8'
  )

  return raw
    .replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '')
    .replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, key, ifBlock, elseBlock) =>
        variables[key] ? ifBlock.trim() : elseBlock.trim()
    )
    .replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, key, block) => variables[key] ? block.trim() : ''
    )
}
```

## Règles de versioning

- Toute modification d'un prompt est une nouvelle version (v1.1, v1.2...)
- Le numéro de version est inscrit en en-tête du fichier
- Les changements sont documentés dans `docs/agents/prompt-changelog.md`
- Ne jamais modifier un prompt en production sans tester en staging d'abord
- Un prompt modifié invalide potentiellement la mémoire agent existante — vérifier la compatibilité

## Tester un prompt

```typescript
// tests/unit/prompts/support.test.ts
import { buildSystemPrompt } from '@teamovia/prompts/inject'

test('inject toutes les variables support', () => {
  const prompt = buildSystemPrompt('support', {
    COMPANY_NAME: 'Acme SARL',
    WORKSPACE_ID: 'ws_123',
    CHANNEL: 'chat',
    CURRENT_DATETIME: '2026-07-12T10:00:00Z',
    TICKET_STATUS: 'aucun',
    AGENT_MEMORY: '',
    KB_CHUNKS: 'Notre délai de livraison est de 5 jours ouvrés.',
    ESCALATION_TEAM: 'service client',
  })

  expect(prompt).toContain('Acme SARL')
  expect(prompt).toContain('Notre délai de livraison est de 5 jours ouvrés.')
  expect(prompt).not.toContain('{{')
})
```
