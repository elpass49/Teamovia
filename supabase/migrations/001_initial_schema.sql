-- ============================================================
-- Teamovia — Migration 001 : schéma initial
-- Date     : 2026-07-12
-- Phase    : 1 — Socle + Agent Support (prépare Phase 2 et 3)
-- Auteur   : Teamovia Architecture
--
-- Ordre d'exécution :
--   1. Extensions
--   2. Enums
--   3. Platform Core   (workspaces, users, workspace_users, agents)
--   4. Mémoire         (agent_memory)
--   5. Billing         (subscriptions)
--   6. Agent Support   (sessions, messages, support_tickets)
--   7. Agent Ventes    (leads, lead_messages, crm_sync_log)
--   8. Orchestrateur   (handoffs, tasks, approvals)
--   9. Intégrations    (integrations, integration_logs)
--  10. KB + Monitoring (knowledge_chunks, agent_logs)
--  11. Fonctions RPC
--  12. Triggers
--  13. Index
--  14. RLS policies
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";         -- pgvector pour les embeddings KB
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- recherche full-text sur content


-- ============================================================
-- 2. ENUMS
-- Centralise les valeurs autorisées — évite les typos en prod
-- ============================================================

CREATE TYPE plan_type AS ENUM ('starter', 'pro', 'enterprise');

CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'viewer');

CREATE TYPE agent_type AS ENUM ('support', 'sales');

CREATE TYPE channel_type AS ENUM ('chat', 'email', 'form');

CREATE TYPE session_status AS ENUM (
  'open', 'resolved', 'escalated', 'transferred'
);

CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');

CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'closed');

CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TYPE lead_source AS ENUM ('form', 'chat', 'email', 'handoff', 'import');

CREATE TYPE lead_status AS ENUM (
  'new', 'qualifying', 'qualified', 'transferred', 'lost'
);

CREATE TYPE lead_action AS ENUM ('qualify', 'nurture', 'disqualify');

CREATE TYPE handoff_target AS ENUM ('support', 'sales', 'human');

CREATE TYPE handoff_status AS ENUM ('pending', 'completed', 'failed');

CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'done', 'cancelled');

CREATE TYPE task_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE integration_provider AS ENUM (
  'hubspot', 'airtable', 'pipedrive', 'notion',
  'gmail', 'sendgrid', 'slack', 'webhook'
);

CREATE TYPE sync_status AS ENUM ('pending', 'success', 'error');

CREATE TYPE kb_source AS ENUM ('manual', 'url', 'file');

CREATE TYPE log_event AS ENUM (
  'message_in', 'message_out', 'tool_call',
  'handoff', 'escalation', 'crm_sync', 'error'
);


-- ============================================================
-- 3. PLATFORM CORE
-- ============================================================

-- ── Workspaces (tenants) ──────────────────────────────────

CREATE TABLE workspaces (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  slug              text        NOT NULL UNIQUE,
  plan              plan_type   NOT NULL DEFAULT 'starter',
  -- Mémoire de niveau workspace : partagée entre tous les agents
  workspace_context jsonb       NOT NULL DEFAULT '{}',
  -- Config d'escalade : email ou webhook de l'opérateur humain
  escalation_config jsonb       NOT NULL DEFAULT '{}',
  -- Token public pour le widget support embarquable
  public_token      uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN workspaces.workspace_context IS
  'Mémoire niveau workspace — partagée entre tous les agents du tenant';
COMMENT ON COLUMN workspaces.escalation_config IS
  'Config de l''équipe d''escalade humaine : email, webhook, nom de service';
COMMENT ON COLUMN workspaces.public_token IS
  'Token public utilisé par le widget support embarquable (x-workspace-token)';


-- ── Users ────────────────────────────────────────────────

CREATE TABLE users (
  id         uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email      text        NOT NULL UNIQUE,
  full_name  text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- ── Workspace members + rôles ─────────────────────────────

CREATE TABLE workspace_users (
  workspace_id uuid           NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  user_id      uuid           NOT NULL REFERENCES users      ON DELETE CASCADE,
  role         workspace_role NOT NULL DEFAULT 'viewer',
  invited_at   timestamptz    NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);


-- ── Agents (prédéfinis par Teamovia) ─────────────────────

CREATE TABLE agents (
  id           uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid       NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  type         agent_type NOT NULL,
  name         text       NOT NULL,
  -- Config propre à l'agent : prompts overrides, seuils, routing
  config       jsonb      NOT NULL DEFAULT '{}',
  -- Actif ou suspendu (quota dépassé, désactivé par l'admin)
  is_active    boolean    NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, type)   -- un seul agent support et un seul agent ventes par workspace
);

COMMENT ON COLUMN agents.config IS
  'Config agent : prompt_override, escalation_rules, scoring_thresholds, crm_mapping';


-- ============================================================
-- 4. MÉMOIRE AGENT
-- Niveau 2 de mémoire : persistante par (agent, user_ref)
-- ============================================================

CREATE TABLE agent_memory (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  agent_id     uuid        NOT NULL REFERENCES agents     ON DELETE CASCADE,
  -- Identifiant externe de l'utilisateur final (email, id anonyme, etc.)
  user_ref     text        NOT NULL,
  -- Faits extraits des conversations passées par le LLM
  facts        jsonb       NOT NULL DEFAULT '{}',
  -- Préférences détectées (langue, canal préféré, ton, sujets récurrents)
  preferences  jsonb       NOT NULL DEFAULT '{}',
  last_seen    timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, agent_id, user_ref)
);

COMMENT ON COLUMN agent_memory.facts IS
  'Faits persistants extraits par le LLM : nom, entreprise, problèmes récurrents';
COMMENT ON COLUMN agent_memory.preferences IS
  'Préférences détectées : langue, canal, ton, sujets récurrents';


-- ============================================================
-- 5. BILLING
-- ============================================================

CREATE TABLE subscriptions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid        NOT NULL UNIQUE REFERENCES workspaces ON DELETE CASCADE,
  stripe_customer_id   text,
  stripe_subscription_id text,
  plan                 plan_type   NOT NULL DEFAULT 'starter',
  status               text        NOT NULL DEFAULT 'active',
  -- Quotas mensuels selon le plan
  quota_messages       int         NOT NULL DEFAULT 1000,
  quota_leads          int         NOT NULL DEFAULT 200,
  quota_members        int         NOT NULL DEFAULT 3,
  -- Consommation du mois en cours
  usage_messages       int         NOT NULL DEFAULT 0,
  usage_leads          int         NOT NULL DEFAULT 0,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 6. AGENT SUPPORT
-- ============================================================

-- ── Sessions ─────────────────────────────────────────────

CREATE TABLE sessions (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid           NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  agent_id       uuid           NOT NULL REFERENCES agents     ON DELETE CASCADE,
  -- Identifiant externe de l'utilisateur final
  user_ref       text,
  channel        channel_type   NOT NULL DEFAULT 'chat',
  status         session_status NOT NULL DEFAULT 'open',
  -- Mémoire de niveau session (contexte court terme de la conversation)
  session_context jsonb         NOT NULL DEFAULT '{}',
  -- Contexte partageable avec d'autres agents lors d'un handoff
  shared_context  jsonb         NOT NULL DEFAULT '{}',
  -- Métadonnées d'entrée (page d'origine, UTM, device, etc.)
  metadata        jsonb         NOT NULL DEFAULT '{}',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON COLUMN sessions.session_context IS
  'Mémoire niveau session — contexte court terme, réinitialisé à chaque session';
COMMENT ON COLUMN sessions.shared_context IS
  'Contexte transmis lors d''un handoff vers un autre agent';


-- ── Messages ─────────────────────────────────────────────

CREATE TABLE messages (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid         NOT NULL REFERENCES sessions ON DELETE CASCADE,
  role       message_role NOT NULL,
  content    text         NOT NULL,
  -- tokens_used : renseigné pour les messages 'assistant' uniquement
  tokens_used int,
  -- latency_ms  : temps de génération LLM en millisecondes
  latency_ms  int,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN messages.tokens_used IS
  'Nombre de tokens consommés — renseigné pour les messages assistant uniquement';


-- ── Tickets de support ───────────────────────────────────

CREATE TABLE support_tickets (
  id           uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid            NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  session_id   uuid            REFERENCES sessions,
  status       ticket_status   NOT NULL DEFAULT 'open',
  priority     ticket_priority NOT NULL DEFAULT 'normal',
  assignee_id  uuid            REFERENCES users,
  title        text,
  notes        text,
  resolved_at  timestamptz,
  created_at   timestamptz     NOT NULL DEFAULT now(),
  updated_at   timestamptz     NOT NULL DEFAULT now()
);


-- ============================================================
-- 7. AGENT VENTES
-- ============================================================

-- ── Leads ────────────────────────────────────────────────

CREATE TABLE leads (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  -- Rattachement à une session support si le lead vient d'un handoff
  session_id   uuid        REFERENCES sessions,
  email        text,
  name         text,
  company      text,
  phone        text,
  source       lead_source NOT NULL DEFAULT 'form',
  status       lead_status NOT NULL DEFAULT 'new',
  -- Score global 0-100
  score        int         CHECK (score >= 0 AND score <= 100),
  -- Détail complet du scoring (dimensions, reasons, disqualifiers, next_step)
  score_data   jsonb       NOT NULL DEFAULT '{}',
  -- Données collectées pendant la qualification (champs libres)
  data         jsonb       NOT NULL DEFAULT '{}',
  assigned_to  uuid        REFERENCES users,
  qualified_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN leads.score_data IS
  'Détail du scoring LLM : dimensions (besoin/budget/delai/decisionnaire), reasons, disqualifiers, recommended_action, next_step';
COMMENT ON COLUMN leads.data IS
  'Données libres collectées pendant la qualification : champs formulaire, réponses prospect';


-- ── Messages de qualification lead ───────────────────────

CREATE TABLE lead_messages (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid         NOT NULL REFERENCES leads ON DELETE CASCADE,
  role       message_role NOT NULL,
  content    text         NOT NULL,
  tokens_used int,
  latency_ms  int,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ── Logs de synchronisation CRM ──────────────────────────

CREATE TABLE crm_sync_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid       NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  lead_id     uuid        NOT NULL REFERENCES leads ON DELETE CASCADE,
  provider    integration_provider NOT NULL,
  -- ID de l'objet créé ou mis à jour côté CRM
  crm_id      text,
  status      sync_status NOT NULL DEFAULT 'pending',
  -- Payload envoyé et réponse reçue (pour le debug)
  request_payload  jsonb NOT NULL DEFAULT '{}',
  response_payload jsonb NOT NULL DEFAULT '{}',
  error_message    text,
  synced_at   timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 8. ORCHESTRATEUR
-- ============================================================

-- ── Handoffs inter-agents ────────────────────────────────

CREATE TABLE handoffs (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid          NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  -- Session source (toujours renseignée)
  source_session_id uuid          NOT NULL REFERENCES sessions,
  -- Agent source
  source_agent_id   uuid          NOT NULL REFERENCES agents,
  -- Agent cible
  target_agent      handoff_target NOT NULL,
  target_agent_id   uuid          REFERENCES agents,
  -- Lead créé si target = 'sales'
  lead_id           uuid          REFERENCES leads,
  status            handoff_status NOT NULL DEFAULT 'pending',
  -- Contexte résumé transmis à l'agent cible
  context           jsonb         NOT NULL DEFAULT '{}',
  -- Raison du handoff détectée par l'agent source
  reason            text,
  completed_at      timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON COLUMN handoffs.context IS
  'Résumé du contexte transmis à l''agent cible : intent, summary, user_data';


-- ── Tâches métier ────────────────────────────────────────
-- Créées par les agents ou les workflows n8n
-- Exemples : "rappeler ce prospect", "vérifier ce remboursement"

CREATE TABLE tasks (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid          NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  agent_id     uuid          REFERENCES agents,
  session_id   uuid          REFERENCES sessions,
  lead_id      uuid          REFERENCES leads,
  -- Titre et description de la tâche
  title        text          NOT NULL,
  description  text,
  status       task_status   NOT NULL DEFAULT 'pending',
  priority     task_priority NOT NULL DEFAULT 'normal',
  assignee_id  uuid          REFERENCES users,
  -- Date d'échéance si définie
  due_at       timestamptz,
  -- Métadonnées libres (type de tâche, source n8n workflow ID, etc.)
  metadata     jsonb         NOT NULL DEFAULT '{}',
  completed_at timestamptz,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now()
);


-- ── Approbations ─────────────────────────────────────────
-- Actions sensibles qui requièrent validation humaine avant exécution

CREATE TABLE approvals (
  id           uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid            NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  task_id      uuid            REFERENCES tasks,
  session_id   uuid            REFERENCES sessions,
  lead_id      uuid            REFERENCES leads,
  -- Description de l'action à approuver
  action       text            NOT NULL,
  -- Payload de l'action (paramètres à envoyer une fois approuvé)
  payload      jsonb           NOT NULL DEFAULT '{}',
  status       approval_status NOT NULL DEFAULT 'pending',
  -- Utilisateur qui a traité l'approbation
  reviewed_by  uuid            REFERENCES users,
  reviewed_at  timestamptz,
  -- Commentaire de l'approbateur
  review_note  text,
  created_at   timestamptz     NOT NULL DEFAULT now()
);

COMMENT ON COLUMN approvals.action IS
  'Description humaine de l''action : "Envoyer un remboursement de 150€", "Transmettre le contrat"';
COMMENT ON COLUMN approvals.payload IS
  'Paramètres de l''action à exécuter après approbation — traité par n8n';


-- ============================================================
-- 9. INTÉGRATIONS
-- ============================================================

-- ── Configurations d'intégrations par workspace ──────────

CREATE TABLE integrations (
  id           uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid                 NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  provider     integration_provider NOT NULL,
  -- Nom affiché dans le dashboard (ex: "Mon HubSpot")
  name         text                 NOT NULL,
  is_active    boolean              NOT NULL DEFAULT true,
  -- Credentials chiffrés (clés API, tokens OAuth) — jamais en clair
  -- Stocké chiffré via Supabase Vault ou colonne chiffrée
  credentials  jsonb                NOT NULL DEFAULT '{}',
  -- Config de mapping (champs source → champs CRM)
  config       jsonb                NOT NULL DEFAULT '{}',
  created_at   timestamptz          NOT NULL DEFAULT now(),
  updated_at   timestamptz          NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

COMMENT ON COLUMN integrations.credentials IS
  'SÉCURITÉ : stocker les credentials via Supabase Vault en production — jamais en clair';
COMMENT ON COLUMN integrations.config IS
  'Mapping des champs, webhooks URLs, paramètres de séquences email';


-- ── Logs d'appels aux intégrations ───────────────────────

CREATE TABLE integration_logs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid        NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  integration_id uuid        NOT NULL REFERENCES integrations ON DELETE CASCADE,
  -- Référence contextuelle (lead, session, task)
  ref_type       text,       -- 'lead' | 'session' | 'task'
  ref_id         uuid,
  -- Action déclenchée (ex: 'create_contact', 'send_email', 'sync_lead')
  action         text        NOT NULL,
  status         sync_status NOT NULL DEFAULT 'pending',
  request_payload  jsonb     NOT NULL DEFAULT '{}',
  response_payload jsonb     NOT NULL DEFAULT '{}',
  error_message  text,
  duration_ms    int,
  created_at     timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 10. BASE DE CONNAISSANCES + MONITORING
-- ============================================================

-- ── Base de connaissances vectorisée ────────────────────

CREATE TABLE knowledge_chunks (
  id           uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid     NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  -- null = chunk partagé entre tous les agents du workspace
  agent_id     uuid     REFERENCES agents ON DELETE CASCADE,
  content      text     NOT NULL,
  -- Embedding 1536 dimensions (OpenAI text-embedding-3-small)
  -- ou 1024 dimensions (Voyage AI) selon le provider configuré
  embedding    vector(1536),
  source       kb_source NOT NULL DEFAULT 'manual',
  -- URL ou nom de fichier source
  source_ref   text,
  -- Métadonnées libres : titre, section, date de mise à jour, etc.
  metadata     jsonb    NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN knowledge_chunks.agent_id IS
  'null = chunk accessible à tous les agents du workspace';
COMMENT ON COLUMN knowledge_chunks.embedding IS
  'Vecteur 1536 dims (OpenAI text-embedding-3-small) — changer la dimension nécessite une migration';


-- ── Logs d'activité des agents ───────────────────────────

CREATE TABLE agent_logs (
  id           uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid      NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  agent_id     uuid      REFERENCES agents,
  session_id   uuid      REFERENCES sessions,
  lead_id      uuid      REFERENCES leads,
  -- Type d'événement
  event_type   log_event NOT NULL,
  -- Payload libre selon le type d'événement
  payload      jsonb     NOT NULL DEFAULT '{}',
  -- Performance
  latency_ms   int,
  tokens_used  int,
  -- Modèle LLM utilisé pour ce call (utile si multi-provider)
  model_used   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN agent_logs.payload IS
  'Contenu variable selon event_type : message résumé, tool name, error message, handoff context';


-- ============================================================
-- 11. FONCTIONS RPC
-- ============================================================

-- ── Recherche vectorielle dans la KB ─────────────────────

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding  vector(1536),
  p_workspace_id   uuid,
  p_agent_id       uuid    DEFAULT NULL,
  match_count      int     DEFAULT 5,
  min_similarity   float   DEFAULT 0.5
)
RETURNS TABLE (
  id          uuid,
  content     text,
  source      kb_source,
  source_ref  text,
  metadata    jsonb,
  similarity  float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    kc.id,
    kc.content,
    kc.source,
    kc.source_ref,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE
    kc.workspace_id = p_workspace_id
    -- Chunk propre à l'agent OU chunk partagé (agent_id IS NULL)
    AND (kc.agent_id = p_agent_id OR kc.agent_id IS NULL)
    -- Filtre sur la similarité minimale pour éviter les résultats hors-sujet
    AND 1 - (kc.embedding <=> query_embedding) >= min_similarity
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_knowledge_chunks IS
  'Recherche sémantique dans la KB — retourne les chunks les plus proches par cosine similarity';


-- ── Métriques agrégées pour le dashboard monitoring ──────

CREATE OR REPLACE FUNCTION get_workspace_metrics(
  p_workspace_id uuid,
  p_agent_id     uuid    DEFAULT NULL,
  p_period       text    DEFAULT 'week'   -- 'day' | 'week' | 'month'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_from timestamptz;
  v_result jsonb;
BEGIN
  v_from := CASE p_period
    WHEN 'day'   THEN now() - interval '1 day'
    WHEN 'week'  THEN now() - interval '7 days'
    WHEN 'month' THEN now() - interval '30 days'
    ELSE              now() - interval '7 days'
  END;

  SELECT jsonb_build_object(
    'period',              p_period,
    'sessions_total',      COUNT(DISTINCT s.id) FILTER (WHERE s.created_at >= v_from),
    'sessions_resolved',   COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'resolved' AND s.created_at >= v_from),
    'sessions_escalated',  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'escalated' AND s.created_at >= v_from),
    'leads_total',         COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= v_from),
    'leads_qualified',     COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'qualified' AND l.created_at >= v_from),
    'avg_score',           ROUND(AVG(l.score) FILTER (WHERE l.score IS NOT NULL AND l.created_at >= v_from)::numeric, 1),
    'avg_latency_ms',      ROUND(AVG(al.latency_ms) FILTER (WHERE al.latency_ms IS NOT NULL AND al.created_at >= v_from)::numeric, 0),
    'tokens_used_total',   COALESCE(SUM(al.tokens_used) FILTER (WHERE al.created_at >= v_from), 0),
    'handoffs_total',      COUNT(DISTINCT h.id) FILTER (WHERE h.created_at >= v_from)
  )
  INTO v_result
  FROM workspaces w
  LEFT JOIN sessions s        ON s.workspace_id = w.id AND (p_agent_id IS NULL OR s.agent_id = p_agent_id)
  LEFT JOIN leads l           ON l.workspace_id = w.id
  LEFT JOIN agent_logs al     ON al.workspace_id = w.id AND (p_agent_id IS NULL OR al.agent_id = p_agent_id)
  LEFT JOIN handoffs h        ON h.workspace_id = w.id
  WHERE w.id = p_workspace_id;

  RETURN v_result;
END;
$$;


-- ============================================================
-- 12. TRIGGERS
-- ============================================================

-- ── updated_at automatique ────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_agent_memory_updated_at
  BEFORE UPDATE ON agent_memory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── Incrémentation automatique des quotas de messages ────

CREATE OR REPLACE FUNCTION increment_message_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Incrémente uniquement pour les messages entrants (role = 'user')
  IF NEW.role = 'user' THEN
    UPDATE subscriptions
    SET usage_messages = usage_messages + 1
    WHERE workspace_id = (
      SELECT workspace_id FROM sessions WHERE id = NEW.session_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_increment_usage
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION increment_message_usage();


-- ── Incrémentation automatique des quotas de leads ───────

CREATE OR REPLACE FUNCTION increment_lead_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE subscriptions
  SET usage_leads = usage_leads + 1
  WHERE workspace_id = NEW.workspace_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_increment_usage
  AFTER INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION increment_lead_usage();


-- ============================================================
-- 13. INDEX
-- ============================================================

-- Platform Core
CREATE INDEX idx_workspace_users_user_id     ON workspace_users (user_id);
CREATE INDEX idx_workspace_users_workspace_id ON workspace_users (workspace_id);
CREATE INDEX idx_agents_workspace_id         ON agents (workspace_id);
CREATE INDEX idx_agents_type                 ON agents (workspace_id, type);

-- Mémoire
CREATE INDEX idx_agent_memory_lookup
  ON agent_memory (workspace_id, agent_id, user_ref);

-- Sessions
CREATE INDEX idx_sessions_workspace_id       ON sessions (workspace_id);
CREATE INDEX idx_sessions_agent_id           ON sessions (agent_id);
CREATE INDEX idx_sessions_status             ON sessions (workspace_id, status);
CREATE INDEX idx_sessions_user_ref           ON sessions (workspace_id, user_ref);
CREATE INDEX idx_sessions_created_at         ON sessions (created_at DESC);

-- Messages
CREATE INDEX idx_messages_session_id         ON messages (session_id);
CREATE INDEX idx_messages_created_at         ON messages (session_id, created_at ASC);

-- Tickets
CREATE INDEX idx_tickets_workspace_id        ON support_tickets (workspace_id);
CREATE INDEX idx_tickets_session_id          ON support_tickets (session_id);
CREATE INDEX idx_tickets_status              ON support_tickets (workspace_id, status);
CREATE INDEX idx_tickets_assignee            ON support_tickets (assignee_id);

-- Leads
CREATE INDEX idx_leads_workspace_id          ON leads (workspace_id);
CREATE INDEX idx_leads_status                ON leads (workspace_id, status);
CREATE INDEX idx_leads_score                 ON leads (workspace_id, score DESC NULLS LAST);
CREATE INDEX idx_leads_source                ON leads (workspace_id, source);
CREATE INDEX idx_leads_assigned_to           ON leads (assigned_to);
CREATE INDEX idx_leads_created_at            ON leads (created_at DESC);
CREATE INDEX idx_leads_session_id            ON leads (session_id);

-- Lead messages
CREATE INDEX idx_lead_messages_lead_id       ON lead_messages (lead_id);
CREATE INDEX idx_lead_messages_created_at    ON lead_messages (lead_id, created_at ASC);

-- CRM sync
CREATE INDEX idx_crm_sync_lead_id            ON crm_sync_log (lead_id);
CREATE INDEX idx_crm_sync_workspace_provider ON crm_sync_log (workspace_id, provider);

-- Handoffs
CREATE INDEX idx_handoffs_workspace_id       ON handoffs (workspace_id);
CREATE INDEX idx_handoffs_source_session     ON handoffs (source_session_id);
CREATE INDEX idx_handoffs_lead_id            ON handoffs (lead_id);
CREATE INDEX idx_handoffs_status             ON handoffs (workspace_id, status);

-- Tasks
CREATE INDEX idx_tasks_workspace_id          ON tasks (workspace_id);
CREATE INDEX idx_tasks_assignee              ON tasks (assignee_id);
CREATE INDEX idx_tasks_status                ON tasks (workspace_id, status);
CREATE INDEX idx_tasks_session_id            ON tasks (session_id);
CREATE INDEX idx_tasks_lead_id               ON tasks (lead_id);

-- Approvals
CREATE INDEX idx_approvals_workspace_id      ON approvals (workspace_id);
CREATE INDEX idx_approvals_status            ON approvals (workspace_id, status);

-- Intégrations
CREATE INDEX idx_integrations_workspace_id   ON integrations (workspace_id);
CREATE INDEX idx_integration_logs_ref        ON integration_logs (ref_type, ref_id);
CREATE INDEX idx_integration_logs_workspace  ON integration_logs (workspace_id, created_at DESC);

-- Knowledge chunks
CREATE INDEX idx_knowledge_workspace_agent   ON knowledge_chunks (workspace_id, agent_id);
-- Index HNSW pour la recherche vectorielle rapide (meilleur que IVFFlat pour < 1M chunks)
CREATE INDEX idx_knowledge_embedding
  ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Logs
CREATE INDEX idx_agent_logs_workspace_id     ON agent_logs (workspace_id);
CREATE INDEX idx_agent_logs_agent_id         ON agent_logs (agent_id);
CREATE INDEX idx_agent_logs_session_id       ON agent_logs (session_id);
CREATE INDEX idx_agent_logs_event_type       ON agent_logs (workspace_id, event_type);
CREATE INDEX idx_agent_logs_created_at       ON agent_logs (created_at DESC);

-- Subscriptions
CREATE INDEX idx_subscriptions_workspace_id  ON subscriptions (workspace_id);


-- ============================================================
-- 14. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Activation RLS sur toutes les tables métier
ALTER TABLE workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sync_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoffs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs        ENABLE ROW LEVEL SECURITY;


-- ── Fonction helper : workspace courant depuis le JWT ─────
-- Le workspace_id est injecté dans le JWT via un hook Supabase Auth

CREATE OR REPLACE FUNCTION current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() ->> 'workspace_id')::uuid;
$$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT role FROM workspace_users
  WHERE workspace_id = current_workspace_id()
    AND user_id = auth.uid();
$$;


-- ── Workspaces ───────────────────────────────────────────

CREATE POLICY "workspace_select"
  ON workspaces FOR SELECT
  USING (id = current_workspace_id());

-- Seul un owner peut modifier le workspace
CREATE POLICY "workspace_update"
  ON workspaces FOR UPDATE
  USING (id = current_workspace_id() AND current_user_role() = 'owner');


-- ── Workspace members ────────────────────────────────────

CREATE POLICY "workspace_users_select"
  ON workspace_users FOR SELECT
  USING (workspace_id = current_workspace_id());

CREATE POLICY "workspace_users_insert"
  ON workspace_users FOR INSERT
  WITH CHECK (
    workspace_id = current_workspace_id()
    AND current_user_role() IN ('owner', 'admin')
  );

CREATE POLICY "workspace_users_delete"
  ON workspace_users FOR DELETE
  USING (
    workspace_id = current_workspace_id()
    AND current_user_role() = 'owner'
  );


-- ── Tables avec workspace_id direct ──────────────────────
-- Pattern mutualisé : SELECT/INSERT/UPDATE/DELETE filtrés par workspace_id

-- Agents
CREATE POLICY "agents_select"   ON agents FOR SELECT   USING (workspace_id = current_workspace_id());
CREATE POLICY "agents_insert"   ON agents FOR INSERT   WITH CHECK (workspace_id = current_workspace_id() AND current_user_role() IN ('owner', 'admin'));
CREATE POLICY "agents_update"   ON agents FOR UPDATE   USING (workspace_id = current_workspace_id() AND current_user_role() IN ('owner', 'admin'));

-- Agent memory
CREATE POLICY "agent_memory_all" ON agent_memory FOR ALL USING (workspace_id = current_workspace_id());

-- Subscriptions (lecture seule pour les non-owners)
CREATE POLICY "subscriptions_select" ON subscriptions FOR SELECT USING (workspace_id = current_workspace_id());
CREATE POLICY "subscriptions_update" ON subscriptions FOR UPDATE USING (workspace_id = current_workspace_id() AND current_user_role() = 'owner');

-- Sessions
CREATE POLICY "sessions_all"    ON sessions           FOR ALL   USING (workspace_id = current_workspace_id());

-- Support tickets
CREATE POLICY "tickets_all"     ON support_tickets    FOR ALL   USING (workspace_id = current_workspace_id());

-- Leads
CREATE POLICY "leads_all"       ON leads              FOR ALL   USING (workspace_id = current_workspace_id());

-- CRM sync
CREATE POLICY "crm_sync_all"    ON crm_sync_log       FOR ALL   USING (workspace_id = current_workspace_id());

-- Handoffs
CREATE POLICY "handoffs_all"    ON handoffs           FOR ALL   USING (workspace_id = current_workspace_id());

-- Tasks
CREATE POLICY "tasks_all"       ON tasks              FOR ALL   USING (workspace_id = current_workspace_id());

-- Approvals
CREATE POLICY "approvals_all"   ON approvals          FOR ALL   USING (workspace_id = current_workspace_id());

-- Intégrations
CREATE POLICY "integrations_all" ON integrations      FOR ALL   USING (workspace_id = current_workspace_id());

-- Integration logs
CREATE POLICY "integration_logs_all" ON integration_logs FOR ALL USING (workspace_id = current_workspace_id());

-- Knowledge chunks
CREATE POLICY "knowledge_all"   ON knowledge_chunks   FOR ALL   USING (workspace_id = current_workspace_id());

-- Agent logs
CREATE POLICY "agent_logs_all"  ON agent_logs         FOR ALL   USING (workspace_id = current_workspace_id());


-- ── Messages : accès via session (pas de workspace_id direct) ──

CREATE POLICY "messages_all"
  ON messages FOR ALL
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE workspace_id = current_workspace_id()
    )
  );


-- ── Lead messages : accès via lead ───────────────────────

CREATE POLICY "lead_messages_all"
  ON lead_messages FOR ALL
  USING (
    lead_id IN (
      SELECT id FROM leads WHERE workspace_id = current_workspace_id()
    )
  );


-- ── Accès public du widget support ───────────────────────
-- Le widget embarquable utilise un x-workspace-token (role anon)
-- Il peut créer des sessions et envoyer des messages UNIQUEMENT

CREATE POLICY "widget_create_session"
  ON sessions FOR INSERT
  WITH CHECK (
    -- Vérifié par le backend via le public_token du workspace
    -- Le backend set workspace_id explicitement — la policy laisse passer
    true
  );

-- NOTE : la validation du public_token est faite côté backend (middleware)
-- avant l'appel Supabase. La RLS est une deuxième ligne de défense,
-- pas la première. Ne jamais exposer le service role key côté client.


-- ============================================================
-- FIN DE MIGRATION
-- ============================================================

-- Commentaire de vérification : toutes ces tables doivent exister
DO $$
DECLARE
  tables text[] := ARRAY[
    'workspaces', 'users', 'workspace_users', 'agents',
    'agent_memory', 'subscriptions',
    'sessions', 'messages', 'support_tickets',
    'leads', 'lead_messages', 'crm_sync_log',
    'handoffs', 'tasks', 'approvals',
    'integrations', 'integration_logs',
    'knowledge_chunks', 'agent_logs'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE EXCEPTION 'Table manquante après migration : %', t;
    END IF;
  END LOOP;
  RAISE NOTICE '✓ Migration 001 vérifiée — 19 tables créées avec succès';
END;
$$;
