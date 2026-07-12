# Teamovia — Architecture de référence

> Document vivant. Version 2 — Juillet 2026.  
> Source de vérité pour toutes les décisions d'implémentation.

---

## Décisions structurantes (non discutables dans le MVP)

| Sujet | Décision |
|---|---|
| Modèle de déploiement | SaaS mutualisé multi-tenant |
| Agents MVP | Support client (P0) · Ventes / leads (P1) |
| Approche agents | Prédéfinis par Teamovia, configurables par le client |
| Isolation des données | `workspace_id` + RLS Supabase sur toutes les tables |
| Logique IA | Backend TypeScript (AI SDK 7) — jamais dans n8n |
| Orchestration métier | n8n (webhooks, CRM, email, handoffs) |
| Repo | Monorepo modulaire |

---

## Les trois couches

```
┌──────────────────────── PLATFORM CORE ────────────────────────┐
│  Auth · Workspaces · RBAC · KB · Billing · Logs · Monitoring  │
├──────────────────────── ORCHESTRATOR ─────────────────────────┤
│  n8n workflows · Agent router · Mémoire partagée cross-agents  │
├───────────── AGENTS LAYER ──────────────────────────────────── ┤
│  Agent support            │  Agent ventes                      │
│  Frontend · Backend · KB  │  Frontend · Backend · KB           │
└───────────────────────────────────────────────────────────────┘
```

---

## Platform Core

### Auth & Tenants

Supabase Auth. Chaque client Teamovia est un `workspace`. Un utilisateur peut appartenir à plusieurs workspaces avec un rôle distinct.

```sql
workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  plan        text NOT NULL DEFAULT 'starter', -- 'starter' | 'pro' | 'enterprise'
  slug        text UNIQUE NOT NULL,
  created_at  timestamptz DEFAULT now()
)

users (
  id          uuid PRIMARY KEY REFERENCES auth.users,
  email       text UNIQUE NOT NULL,
  created_at  timestamptz DEFAULT now()
)

workspace_users (
  workspace_id  uuid REFERENCES workspaces,
  user_id       uuid REFERENCES users,
  role          text NOT NULL DEFAULT 'viewer', -- 'owner' | 'admin' | 'viewer'
  PRIMARY KEY (workspace_id, user_id)
)
```

**RLS — règle universelle.** Toutes les tables métier ont cette policy :
```sql
CREATE POLICY "tenant_isolation" ON <table>
  USING (workspace_id = (auth.jwt() ->> 'workspace_id')::uuid);
```

Le `workspace_id` est injecté dans le JWT via un hook Supabase Auth à la connexion.

### Base de connaissances

Une seule table vectorisée, partagée entre agents du même workspace. Si `agent_id` est null, le chunk est accessible à tous les agents du workspace.

```sql
knowledge_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid REFERENCES workspaces NOT NULL,
  agent_id      uuid REFERENCES agents,         -- null = partagé
  content       text NOT NULL,
  embedding     vector(1536),
  source        text,                            -- 'manual' | 'url' | 'file'
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
)
```

Recherche vectorielle via RPC Supabase :
```sql
CREATE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  p_workspace_id  uuid,
  p_agent_id      uuid DEFAULT NULL,
  match_count     int DEFAULT 5
) RETURNS TABLE (id uuid, content text, similarity float)
LANGUAGE sql AS $$
  SELECT id, content, 1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks
  WHERE workspace_id = p_workspace_id
    AND (agent_id = p_agent_id OR agent_id IS NULL)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### Logs & Monitoring

```sql
agent_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid REFERENCES workspaces NOT NULL,
  agent_id      uuid REFERENCES agents,
  session_id    uuid,
  event_type    text NOT NULL, -- 'message_in' | 'message_out' | 'tool_call' | 'handoff' | 'error'
  payload       jsonb DEFAULT '{}',
  latency_ms    int,
  tokens_used   int,
  created_at    timestamptz DEFAULT now()
)
```

Chaque action d'un agent écrit un log. Le dashboard monitoring est une vue agrégée sur cette table.

### Billing

Stripe + table `subscriptions` liée à `workspaces`. Les quotas (messages/mois, agents actifs, membres) sont lus depuis `workspaces.plan` et vérifiés via un middleware backend.

---

## Orchestrateur (n8n)

### Ce que n8n fait

- Déclencher des actions externes (email, Slack, CRM) via webhook depuis le backend agent
- Porter les séquences automatisées (relances, nurturing)
- Router les handoffs inter-agents
- Synchroniser les données vers des outils tiers (Airtable, HubSpot, Notion)

### Ce que n8n ne fait pas

- Appeler le LLM directement
- Contenir la logique de qualification ou de scoring
- Gérer la mémoire ou le contexte d'exécution
- Valider les règles métier

### Handoff inter-agents

Flux concret : un prospect arrive en support, l'agent détecte une intention d'achat.

```
Support backend
  → POST /api/orchestrator/handoff
    { session_id, target: 'sales', context: { ... } }
  → n8n workflow "agent-handoff"
    → crée un lead dans agent ventes
    → notifie le commercial si configuré
    → met à jour le statut de la session support
```

La mémoire partagée entre agents passe par la table `sessions` avec un champ `shared_context jsonb`.

---

## Mémoire — quatre niveaux

| Niveau | Portée | Table / mécanisme | Durée |
|---|---|---|---|
| **Session** | Une conversation | `sessions.context jsonb` | Durée de la session |
| **Agent** | Toutes les interactions d'un user avec un agent | `agent_memory` (voir ci-dessous) | Persistante |
| **Workspace** | Données partagées entre tous les agents | `workspace_context jsonb` sur `workspaces` | Persistante |
| **Documentaire** | Base de connaissances vectorisée | `knowledge_chunks` + pgvector | Persistante |

```sql
agent_memory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid REFERENCES workspaces NOT NULL,
  agent_id      uuid REFERENCES agents NOT NULL,
  user_ref      text,               -- identifiant externe de l'utilisateur final
  facts         jsonb DEFAULT '{}', -- faits extraits des conversations passées
  preferences   jsonb DEFAULT '{}', -- préférences détectées
  last_seen     timestamptz,
  updated_at    timestamptz DEFAULT now()
)
```

---

## Agent Support Client

### Rôle

Répondre aux demandes entrantes (chat, email, formulaire), chercher dans la KB, escalader si besoin, journaliser chaque action.

### Frontend — deux surfaces

**Widget embarquable** (`widget.teamovia.com/[workspace_id]`)
- Web component ou iframe, intégrable sur n'importe quel site
- Chat avec historique, statut de session, branding configurable
- Appelle directement l'API support via token public workspace

**Dashboard opérateur** (`app.teamovia.com/support`)
- Liste des sessions actives et archivées
- Vue conversation avec timeline des events
- Configuration : prompts, KB, règles d'escalade, intégrations
- Métriques : volume, temps de réponse, taux de résolution

### Backend — routes API

```
POST /api/agents/support/message        Traite un message entrant
GET  /api/agents/support/sessions       Liste les sessions
GET  /api/agents/support/session/:id    Détail + messages d'une session
POST /api/agents/support/escalate       Déclenche le handoff
POST /api/agents/support/kb/chunk       Ajoute un chunk à la KB
POST /api/agents/support/kb/sync        Sync depuis une URL ou un fichier
```

### Logique de traitement d'un message

```typescript
async function handleSupportMessage(sessionId: string, input: string) {
  // 1. Contexte
  const session = await getSession(sessionId)
  const memory  = await getAgentMemory(session.workspaceId, 'support', session.userRef)

  // 2. RAG
  const embedding = await embedText(input)
  const chunks    = await matchKnowledgeChunks(embedding, session.workspaceId, agentId)

  // 3. Appel LLM (AI SDK 7)
  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    system: buildSupportSystemPrompt(memory, chunks),
    messages: await getSessionMessages(sessionId),
  })

  // 4. Persist + log
  await saveMessage(sessionId, 'assistant', text)
  await writeLog(session.workspaceId, 'support', sessionId, 'message_out', { tokens: usage })

  // 5. Règles post-réponse
  if (detectEscalation(text)) await triggerN8nWebhook('support-escalate', { sessionId })
  if (detectSalesIntent(text)) await triggerN8nWebhook('agent-handoff', { sessionId, target: 'sales' })

  return text
}
```

### Modèle de données

```sql
sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid REFERENCES workspaces NOT NULL,
  agent_id        uuid REFERENCES agents NOT NULL,
  user_ref        text,
  channel         text DEFAULT 'chat', -- 'chat' | 'email' | 'form'
  status          text DEFAULT 'open', -- 'open' | 'resolved' | 'escalated' | 'transferred'
  shared_context  jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
)

messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid REFERENCES sessions NOT NULL,
  role        text NOT NULL, -- 'user' | 'assistant' | 'system'
  content     text NOT NULL,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
)

support_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid REFERENCES sessions,
  workspace_id uuid REFERENCES workspaces NOT NULL,
  status       text DEFAULT 'open', -- 'open' | 'in_progress' | 'closed'
  assignee     uuid REFERENCES users,
  priority     text DEFAULT 'normal',
  created_at   timestamptz DEFAULT now()
)
```

---

## Agent Ventes / Qualification de Leads

### Rôle

Recevoir des leads (site, formulaire, email, handoff support), qualifier, scorer, enrichir, pousser dans le CRM, déclencher des séquences automatiques.

### Frontend

**Vue pipeline** (`app.teamovia.com/sales`)
- Kanban ou liste : leads par statut (nouveau → qualifié → transmis → perdu)
- Colonnes : score, source, dernière interaction, assigné à

**Vue lead détaillée**
- Fiche prospect : données collectées, score avec détail des raisons
- Historique de la conversation de qualification
- Actions manuelles : qualifier, rejeter, assigner, déclencher séquence

**Configuration agent**
- Critères de qualification (champs à collecter, questions clés)
- Seuils de score et logique de routing
- Mapping vers le CRM (champs source → champs cible)
- Séquences email disponibles

### Backend — routes API

```
POST /api/agents/sales/lead             Crée ou met à jour un lead
POST /api/agents/sales/qualify/:id      Déclenche la qualification IA
GET  /api/agents/sales/leads            Liste filtrée + triée
GET  /api/agents/sales/lead/:id         Fiche lead complète
POST /api/agents/sales/sync-crm/:id     Pousse vers CRM externe
POST /api/agents/sales/sequence/:id     Démarre une séquence email
```

### Logique de scoring

```typescript
type LeadScore = {
  score: number          // 0-100
  confidence: 'low' | 'medium' | 'high'
  reasons: string[]      // ex: ["Budget confirmé", "Décideur identifié", "Besoin urgent"]
  disqualifiers: string[] // ex: ["Hors zone géographique"]
  recommended_action: 'qualify' | 'nurture' | 'disqualify'
}
```

Le score est calculé par le LLM à partir de la conversation, des données du formulaire et des critères configurés par le workspace. Il est stocké dans `leads.score_data jsonb` et recalculé à chaque interaction significative.

### Modèle de données

```sql
leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid REFERENCES workspaces NOT NULL,
  session_id      uuid REFERENCES sessions,   -- si vient du support
  email           text,
  name            text,
  company         text,
  source          text,  -- 'form' | 'chat' | 'email' | 'handoff' | 'import'
  status          text DEFAULT 'new',  -- 'new' | 'qualifying' | 'qualified' | 'transferred' | 'lost'
  score           int,
  score_data      jsonb DEFAULT '{}',  -- détail du scoring
  data            jsonb DEFAULT '{}',  -- données collectées
  assigned_to     uuid REFERENCES users,
  qualified_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
)

lead_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid REFERENCES leads NOT NULL,
  role        text NOT NULL,
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now()
)

crm_sync_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid REFERENCES leads NOT NULL,
  crm_name    text NOT NULL,  -- 'hubspot' | 'airtable' | 'pipedrive'
  crm_id      text,
  status      text,           -- 'success' | 'error'
  payload     jsonb,
  synced_at   timestamptz DEFAULT now()
)
```

---

## Structure du repo

```
teamovia/
├── apps/
│   ├── web/                  Landing page et pages publiques (Next.js)
│   ├── dashboard/            App principale Teamovia (Next.js)
│   ├── agent-support/        Widget embarquable support (React/Vite)
│   └── agent-sales/          Frontend pipeline ventes (Next.js)
│
├── services/
│   ├── api/                  Backend principal (TypeScript / Hono ou Express)
│   ├── agents/
│   │   ├── support/          Logique spécifique agent support
│   │   └── sales/            Logique spécifique agent ventes
│   └── integrations/         Connecteurs CRM, email, webhooks
│
├── packages/
│   ├── ui/                   Composants partagés (shadcn/ui + custom)
│   ├── types/                Types TypeScript partagés
│   ├── agents-sdk/           Abstractions LLM, tools, mémoire (AI SDK 7)
│   ├── prompts/              Prompts système versionnés par agent
│   └── config/               Variables d'environnement et constantes
│
├── supabase/
│   ├── migrations/           Migrations SQL ordonnées
│   ├── seeds/                Données de test et démo
│   ├── functions/            Edge Functions (webhooks entrants, crons)
│   └── policies/             RLS policies documentées
│
├── n8n/
│   ├── workflows/            Exports JSON des workflows n8n
│   ├── templates/            Templates réutilisables
│   └── credentials-schema/   Schéma des credentials attendus
│
├── docs/
│   ├── architecture/         Ce document + diagrammes
│   ├── agents/               Spec fonctionnelle de chaque agent
│   ├── api/                  Contrats d'API (OpenAPI)
│   └── CLAUDE.md             Instructions pour Claude Code
│
└── tests/
    ├── e2e/
    └── unit/
```

---

## Feuille de route

### Phase 1 — Socle + Agent Support
**Critère de sortie : une boucle complète fonctionne de bout en bout en production.**

- [ ] Schema Supabase v1 + migrations + RLS policies
- [ ] Auth workspace + RBAC opérationnel
- [ ] KB : ingestion de documents + recherche vectorielle
- [ ] Agent support : traitement d'un message entrant avec RAG
- [ ] Widget chat embarquable fonctionnel
- [ ] Dashboard opérateur : sessions, messages, statuts
- [ ] Logs : chaque action tracée dans `agent_logs`
- [ ] Workflow n8n : email de notification à l'opérateur

### Phase 2 — Agent Ventes
**Critère de sortie : un lead entre, est scoré, et atterrit dans le CRM.**

- [ ] Modèle leads + messages + crm_sync_log
- [ ] Logique de scoring LLM avec structured output
- [ ] Frontend pipeline leads
- [ ] Sync CRM via n8n (Airtable en priorité)
- [ ] Séquences email déclenchables
- [ ] Vue lead détaillée avec historique

### Phase 3 — Orchestration + Handoff
**Critère de sortie : un prospect du support devient un lead qualifié automatiquement.**

- [ ] Handoff support → ventes fonctionnel
- [ ] Mémoire partagée cross-agents opérationnelle
- [ ] Dashboard monitoring global (métriques cross-agents)
- [ ] Onboarding workspace (invite, configuration initiale)
- [ ] Billing Stripe connecté aux quotas

---

## Risques et garde-fous

| Risque | Conséquence | Garde-fou |
|---|---|---|
| Logique IA dans n8n | Maintenabilité nulle, debugging impossible | Règle : n8n déclenche, le backend décide |
| RLS insuffisante | Fuite de données cross-tenant | Tests d'isolation systématiques avant chaque déploiement |
| Agent builder prématuré | Complexité ×5 pour zéro valeur MVP | Agents prédéfinis uniquement jusqu'à 500 workspaces actifs |
| Mémoire réduite à un `context jsonb` | Perte de continuité, expérience dégradée | Les quatre niveaux de mémoire doivent exister dès la Phase 1 |
| Monorepo mal structuré | Couplage involontaire entre agents | Chaque package a des imports explicites, pas de barrel exports globaux |

