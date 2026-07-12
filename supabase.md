---

## 3. Tables — Référence complète

### `workspaces`
Organisation racine multi-tenant. Chaque workspace est une entreprise cliente de TEAMovIA.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | Identifiant unique |
| `name` | text | Nom du workspace |
| `slug` | text UNIQUE | Identifiant URL |
| `logo_url` | text | URL du logo |
| `plan` | text | `free` · `starter` · `pro` · `enterprise` |
| `is_active` | boolean | Workspace actif |
| `created_at` | timestamptz | — |
| `updated_at` | timestamptz | Auto-mis à jour via trigger |

> 🔁 **Trigger** : à la création d'un workspace, les 4 agents (Clara, Nova, Leo, Alma) sont seedés automatiquement.

---

### `workspace_members`
Membres d'un workspace (liés à `auth.users`).

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | — |
| `workspace_id` | uuid FK | → `workspaces` |
| `user_id` | uuid FK | → `auth.users` |
| `role` | text | `owner` · `admin` · `member` · `viewer` |
| `invited_at` | timestamptz | Date d'invitation |
| `accepted_at` | timestamptz | Date d'acceptation |

**Hiérarchie des rôles** (du plus permissif au plus restrictif) :  
`owner` > `admin` > `member` > `viewer`

---

### `clients`
Entreprises clientes gérées par le workspace.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | — |
| `workspace_id` | uuid FK | → `workspaces` |
| `name` | text | Nom de l'entreprise |
| `domain` | text | Domaine web |
| `industry` | text | Secteur d'activité |
| `metadata` | jsonb | Données libres |

---

### `contacts`
Individus (leads, prospects, clients) rattachés à un workspace et optionnellement à un client.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | — |
| `workspace_id` | uuid FK | → `workspaces` |
| `client_id` | uuid FK | → `clients` (optionnel) |
| `first_name` | text | — |
| `last_name` | text | — |
| `email` | text | — |
| `phone` | text | — |
| `status` | text | `lead` · `prospect` · `client` · `churned` |
| `source` | text | `website` · `linkedin` · `ads` · `referral`… |
| `metadata` | jsonb | Données libres |

---

### `leads`
Vue enrichie d'un contact dans le pipeline commercial.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | — |
| `workspace_id` | uuid FK | → `workspaces` |
| `contact_id` | uuid FK | → `contacts` |
| `stage` | text | `new` · `qualified` · `proposal` · `negotiation` · `won` · `lost` |
| `score` | integer | Score de qualification (0–100) |
| `assigned_to` | uuid FK | → `auth.users` |
| `expected_value` | numeric | Valeur estimée du deal |
| `closed_at` | timestamptz | Date de clôture |
| `notes` | text | Notes libres |

---

### `agents`
Les 4 agents IA de TEAMovIA, seedés automatiquement par workspace.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | — |
| `workspace_id` | uuid FK | → `workspaces` |
| `key` | text UNIQUE/ws | `ops` · `marketing` · `sales` · `support` |
| `name` | text | `Clara` · `Nova` · `Leo` · `Alma` |
| `description` | text | Rôle résumé |
| `system_prompt` | text | Prompt système LLM |
| `llm_model` | text | Défaut : `gpt-4o` |
| `avatar_url` | text | URL avatar UI |
| `color` | text | Hex couleur UI |
| `is_active` | boolean | Agent actif |

**Correspondance agents ↔ rôles :**

 - Agent Conversationnel | Ava | `#6366F1` (indigo) | Qualification, onboarding et assistance en temps réel. | Instructions détaillées pour guider la conversation client vers une opportunité de vente ou de support.|
 - Agent Sales | Noah | `#10B981` (vert) | Gestion du cycle de vie des leads : relance, proposition commerciale et signature. | Prompt système axé sur la stratégie commerciale B2B, l'analyse de pipeline et le dépassement des objectifs. |
 - Agent Support | Lina | `#EF4444` (rouge) | Résolution des tickets clients en utilisant la base de connaissances.| Prompt empathique et factuel, se concentrant sur la recherche d'informations précises pour un service client de haute qualité. |
 - Agent Contenu | Milo | `#F59E0B` (amber) | Génération de contenu marketing (articles, posts sociaux, scripts).| Prompt créatif axé sur le ton et les formats spécifiques au canal (ex: "pour Instagram", "article SEO"). |
 - Agent Ops | Sara | `#3b82f6` (blue) | Coordination des processus internes : onboarding, gestion du temps et tâches administratives. | Prompt méthodologique se concentrant sur la rigueur, l'ordre des étapes et le respect de procédures établies.|
 - Agent Vocal | Ethan | `custom_vocal` | Gestion des interactions vocales (appels) en temps réel. | Prompt axé sur la capacité à transformer une conversation orale non structurée en données actionnables (transcription, compte-rendu).|
 - Growth | Growth | `#05966b` (emerald) | Analyse de données et identification des opportunités d'amélioration/croissance. | Prompt analytique, obligeant l'agent à citer ses sources (métriques) avant de faire une recommandation. |
 - Admin | Admin | `#7c3aed` (purple) | Gestion du back-office, reporting et documentation interne.| Prompt formel et exhaustif, garantissant la traçabilité et le respect des normes internes.

---

### `agent_capabilities`
Capacités déclarées de chaque agent (utilisées par l'orchestrateur).

| Colonne | Type | Exemples de valeurs |
|---|---|---|
| `capability` | text | `lead_qualification` · `follow_up` · `content_writing` · `reporting` · `ticket_resolution` |
| `config` | jsonb | Paramètres spécifiques à la capacité |

---

### `knowledge_items`
Base de connaissance partagée entre les agents d'un workspace.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | — |
| `workspace_id` | uuid FK | → `workspaces` |
| `title` | text | Titre du document |
| `content` | text | Contenu Markdown ou texte brut |
| `source_type` | text | `manual` · `faq` · `crm` · `docs` · `url` |
| `tags` | text[] | Tags libres pour filtrage |
| `metadata` | jsonb | Données libres |

Utilise `knowledge_item_agents` pour restreindre un document à certains agents seulement.

---

### `integrations`
Outils externes connectés au workspace (Gmail, HubSpot, Slack, etc.).

| Colonne | Type | Exemples |
|---|---|---|
| `type` | text | `gmail` · `hubspot` · `pipedrive` · `slack` · `airtable` · `whatsapp` · `notion` |
| `config` | jsonb | Tokens, webhook_url, scopes (⚠️ chiffrer les secrets en prod) |
| `is_active` | boolean | Intégration active |

Utilise `agent_integrations` pour définir quels agents peuvent utiliser quelle intégration et avec quelles permissions.

---

### `workflows`
Templates de scénarios multi-agents réutilisables.

| Colonne | Type | Description |
|---|---|---|
| `name` | text | Ex : "Onboarding nouveau client" |
| `trigger_type` | text | `manual` · `webhook` · `schedule` · `event` |
| `config` | jsonb | Configuration du déclencheur |
| `is_active` | boolean | — |

Chaque workflow a des **`workflow_steps`** ordonnées (agent_key + action_type).

---

### `workflow_runs`
Instance concrète d'exécution d'un workflow.

| Statut | Description |
|---|---|
| `queued` | En attente de démarrage |
| `running` | En cours d'exécution |
| `waiting_human` | En attente d'approbation humaine |
| `completed` | Terminé avec succès |
| `failed` | Terminé en erreur |
| `cancelled` | Annulé |

---

### `agent_tasks`
Tâches concrètes assignées à un agent.

| Colonne | Type | Description |
|---|---|---|
| `type` | text | `qualify_lead` · `send_followup` · `generate_report` · `write_content` · `internal_task` |
| `payload` | jsonb | Paramètres de la tâche |
| `priority` | integer | `0` normal · `1` haute · `2` urgente |
| `status` | text | `pending` · `queued` · `running` · `done` · `failed` · `cancelled` |

---

### `agent_conversations` & `agent_messages`
Historique des échanges entre un agent et un contact.

**Canaux disponibles** : `email` · `whatsapp` · `webchat` · `sms` · `slack`

**Types d'expéditeur (`sender_type`)** : `user` · `agent` · `system` · `human_override`

> 🔁 **Trigger** : `last_message_at` sur `agent_conversations` est mis à jour automatiquement à chaque nouveau message.

---

### `human_approvals`
Approbations humaines requises avant qu'un agent continue une action sensible.

| Statut | Description |
|---|---|
| `pending` | En attente de revue |
| `approved` | Approuvé |
| `rejected` | Rejeté |
| `expired` | Délai dépassé |

---

### `tool_calls`
Trace de chaque appel outil effectué par un agent (email envoyé, CRM mis à jour, etc.).

| Colonne | Description |
|---|---|
| `tool_name` | `send_email` · `crm_update` · `slack_notify` · `create_task`… |
| `input_payload` | Paramètres envoyés à l'outil |
| `output_payload` | Réponse reçue |
| `duration_ms` | Temps d'exécution |
| `status` | `pending` · `success` · `error` |

---

### `agent_audit_logs`
Journal immuable de toutes les actions (qui, quoi, quand, sur quoi).

| `actor_type` | `action` (exemples) |
|---|---|
| `agent` | `message_sent` · `task_completed` · `lead_qualified` |
| `user` | `workflow_triggered` · `approval_given` |
| `system` | `seed_created` · `trigger_fired` |

---

## 4. Sécurité — Row Level Security (RLS)

Toutes les tables ont le RLS activé. Les accès sont contrôlés par deux fonctions :

```sql
-- Vérifie si l'utilisateur connecté est membre du workspace
is_workspace_member(workspace_id uuid) → boolean

-- Vérifie si l'utilisateur a un rôle suffisant
has_workspace_role(workspace_id uuid, required_role text) → boolean
```

**Matrice de permissions par rôle :**

| Action | viewer | member | admin | owner |
|---|:---:|:---:|:---:|:---:|
| Lire les données | ✅ | ✅ | ✅ | ✅ |
| Créer / modifier | ❌ | ✅ | ✅ | ✅ |
| Supprimer | ❌ | ❌ | ✅ | ✅ |
| Gérer les agents | ❌ | ❌ | ✅ | ✅ |
| Gérer les membres | ❌ | ❌ | ✅ | ✅ |
| Supprimer workspace | ❌ | ❌ | ❌ | ✅ |

> ⚠️ Pour les automations n8n ou Claude Code côté serveur, utilise la `SERVICE_ROLE_KEY` qui contourne le RLS. Ne l'expose jamais côté client.

---

## 5. Vues dashboard pré-construites

### `dashboard_agent_stats`
Statistiques par agent par workspace.
```sql
SELECT * FROM dashboard_agent_stats WHERE workspace_id = '<uuid>';
-- Retourne : agent_name, agent_key, color, tasks_pending, tasks_running, tasks_done, tasks_failed, conversations_open
```

### `open_approvals`
Toutes les approbations humaines en attente.
```sql
SELECT * FROM open_approvals WHERE workspace_id = '<uuid>';
-- Retourne : approval details + agent_name + agent_key
```

### `lead_pipeline`
Vue agrégée du pipeline commercial par étape.
```sql
SELECT * FROM lead_pipeline WHERE workspace_id = '<uuid>';
-- Retourne : stage, total_leads, total_value, avg_score
```

---

## 6. Patterns TypeScript pour Lovable

### Récupérer les agents d'un workspace
```typescript
const { data: agents } = await supabase
  .from('agents')
  .select('*')
  .eq('workspace_id', workspaceId)
  .eq('is_active', true)
  .order('key')
```

### Créer un lead
```typescript
const { data: lead } = await supabase
  .from('leads')
  .insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    stage: 'new',
    score: 0,
    expected_value: 5000
  })
  .select()
  .single()
```

### Démarrer une conversation agent
```typescript
const { data: conversation } = await supabase
  .from('agent_conversations')
  .insert({
    workspace_id: workspaceId,
    agent_id: agentId,
    contact_id: contactId,
    channel: 'webchat',
    status: 'open'
  })
  .select()
  .single()
```

### Envoyer un message
```typescript
await supabase
  .from('agent_messages')
  .insert({
    conversation_id: conversation.id,
    sender_type: 'agent',
    agent_id: agentId,
    content: 'Bonjour, comment puis-je vous aider ?',
    raw_payload: { model: 'gpt-4o', tokens: 42 }
  })
```

### Créer une tâche agent
```typescript
await supabase
  .from('agent_tasks')
  .insert({
    workspace_id: workspaceId,
    agent_id: agentId,
    type: 'qualify_lead',
    payload: { lead_id: leadId, priority: 'high' },
    status: 'pending',
    priority: 1
  })
```

### Écouter les nouvelles tâches en temps réel (Realtime)
```typescript
supabase
  .channel('agent-tasks')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'agent_tasks',
    filter: `workspace_id=eq.${workspaceId}`
  }, (payload) => {
    console.log('Nouvelle tâche agent :', payload.new)
  })
  .subscribe()
```

---

## 7. Patterns pour Claude Code / n8n (service role)

```typescript
// Côté serveur uniquement — utilise la service role key
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // bypass RLS
)

// Logger une action dans l'audit trail
await supabaseAdmin
  .from('agent_audit_logs')
  .insert({
    workspace_id: workspaceId,
    agent_id: agentId,
    actor_type: 'agent',
    action: 'lead_qualified',
    target_type: 'lead',
    target_id: leadId,
    details: { score: 85, reason: 'Budget confirmé' }
  })

// Tracer un tool call
await supabaseAdmin
  .from('tool_calls')
  .insert({
    workspace_id: workspaceId,
    agent_id: agentId,
    tool_name: 'send_email',
    input_payload: { to: 'client@example.com', subject: 'Suivi' },
    status: 'pending'
  })

// Demander une approbation humaine
await supabaseAdmin
  .from('human_approvals')
  .insert({
    workspace_id: workspaceId,
    agent_task_id: taskId,
    requested_by: agentId,
    status: 'pending',
    reason: 'Proposition commerciale > 10 000€ — validation requise',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  })
```

---

## 8. Checklist d'intégration

### Lovable (frontend)
- [ ] Ajouter `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans les env vars
- [ ] Installer `@supabase/supabase-js`
- [ ] Créer `lib/supabase.ts` avec le client
- [ ] Implémenter l'auth Supabase (magic link ou OAuth)
- [ ] Utiliser `workspace_id` systématiquement dans toutes les requêtes
- [ ] Activer le Realtime sur `agent_tasks` et `agent_conversations` pour les mises à jour live
- [ ] Tester les accès avec un rôle `member` (ne doit pas voir les données d'autres workspaces)

### Claude Code (backend / automatisations)
- [ ] Ajouter `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans l'env
- [ ] Ne jamais exposer la `SERVICE_ROLE_KEY` côté client
- [ ] Passer `workspace_id` dans chaque insert / update
- [ ] Logger chaque action dans `agent_audit_logs`
- [ ] Tracer chaque appel outil dans `tool_calls`
- [ ] Mettre à jour le `status` des `agent_tasks` à chaque changement d'état
- [ ] Créer une `human_approval` avant toute action irréversible à fort impact

### n8n
- [ ] Utiliser le nœud **Supabase** avec la `SERVICE_ROLE_KEY`
- [ ] Écouter les nouvelles `agent_tasks` (status `pending`) comme déclencheur
- [ ] Mettre à jour `workflow_runs.status` à chaque étape
- [ ] Insérer les résultats dans `workflow_run_steps`
- [ ] Enregistrer chaque `tool_call` avec son statut et durée

---

## 9. Informations projet

| Propriété | Valeur |
|---|---|
| **Projet** | TEAMovIA |
| **Project ID** | `mfnnguxuulrsuvomtlhv` |
| **URL** | `https://mfnnguxuulrsuvomtlhv.supabase.co` |
| **Région** | EU Central (Frankfurt) — `eu-central-1` |
| **Compute** | Nano (t4g.nano) |
| **Schema version** | V2 Production-Grade |
| **Tables** | 22 |
| **Agents seedés** | Clara (ops) · Nova (marketing) · Leo (sales) · Alma (support) |