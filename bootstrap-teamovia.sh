#!/usr/bin/env bash
# ============================================================
# bootstrap-teamovia.sh
# Crée le monorepo Teamovia complet en local
#
# Usage :
#   chmod +x bootstrap-teamovia.sh
#   ./bootstrap-teamovia.sh
#
# Prérequis :
#   - Node.js >= 20
#   - pnpm >= 9 (installé automatiquement si absent)
#   - Git
#
# Ce script :
#   1. Crée l'arborescence complète du monorepo
#   2. Place tous les fichiers de base (configs, stubs, docs)
#   3. Copie les fichiers produits par Claude (migration, middleware, prompts...)
#   4. Initialise Git + premier commit
#   5. Affiche les prochaines étapes
# ============================================================

set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Couleurs et helpers
# ─────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${BLUE}[info]${NC}    $1"; }
success() { echo -e "${GREEN}[ok]${NC}      $1"; }
warn()    { echo -e "${YELLOW}[warn]${NC}    $1"; }
error()   { echo -e "${RED}[error]${NC}   $1"; exit 1; }
section() { echo -e "\n${BLUE}══════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}══════════════════════════════════════${NC}"; }

# ─────────────────────────────────────────────────────────────
# Vérifications prérequis
# ─────────────────────────────────────────────────────────────

section "Vérification des prérequis"

command -v git  >/dev/null 2>&1 || error "Git non trouvé. Installer Git avant de continuer."
command -v node >/dev/null 2>&1 || error "Node.js non trouvé. Installer Node.js >= 20."

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
[ "$NODE_VERSION" -ge 20 ] || error "Node.js >= 20 requis. Version actuelle : $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  warn "pnpm non trouvé — installation automatique..."
  npm install -g pnpm
fi

success "Git      : $(git --version)"
success "Node.js  : $(node -v)"
success "pnpm     : $(pnpm -v)"

# ─────────────────────────────────────────────────────────────
# Dossier racine
# ─────────────────────────────────────────────────────────────

section "Création du monorepo"

REPO_NAME="teamovia"

if [ -d "$REPO_NAME" ]; then
  warn "Le dossier '$REPO_NAME' existe déjà."
  read -r -p "Supprimer et recréer ? (y/N) " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || error "Abandon. Déplacer ou supprimer le dossier manuellement."
  rm -rf "$REPO_NAME"
fi

mkdir -p "$REPO_NAME"
cd "$REPO_NAME"
ROOT="$(pwd)"
info "Dossier racine : $ROOT"

# ─────────────────────────────────────────────────────────────
# Arborescence complète
# ─────────────────────────────────────────────────────────────

section "Création de l'arborescence"

DIRS=(
  # Apps
  "apps/web/src"
  "apps/dashboard/src"
  "apps/agent-support/src"
  "apps/agent-sales/src"

  # Services
  "services/api/src/agents/support"
  "services/api/src/agents/sales"
  "services/api/src/middleware"
  "services/api/src/routes"
  "services/integrations/src"

  # Packages partagés
  "packages/ui/src/components"
  "packages/ui/src/hooks"
  "packages/types/src"
  "packages/agents-sdk/src"
  "packages/prompts/src"
  "packages/config/src"

  # Supabase
  "supabase/migrations"
  "supabase/seeds"
  "supabase/functions"
  "supabase/policies"

  # n8n
  "n8n/workflows"
  "n8n/templates"
  "n8n/credentials-schema"

  # Docs
  "docs/architecture"
  "docs/agents"
  "docs/api"
  "docs/suivi"

  # Tests
  "tests/e2e"
  "tests/unit"
)

for dir in "${DIRS[@]}"; do
  mkdir -p "$dir"
done

success "Arborescence créée (${#DIRS[@]} dossiers)"

# ─────────────────────────────────────────────────────────────
# Fichiers .gitkeep pour les dossiers vides
# ─────────────────────────────────────────────────────────────

EMPTY_DIRS=(
  "apps/web/src"
  "apps/agent-support/src"
  "apps/agent-sales/src"
  "services/integrations/src"
  "packages/ui/src/components"
  "packages/ui/src/hooks"
  "n8n/workflows"
  "n8n/templates"
  "n8n/credentials-schema"
  "supabase/functions"
  "tests/e2e"
  "tests/unit"
  "docs/suivi"
)

for dir in "${EMPTY_DIRS[@]}"; do
  touch "$dir/.gitkeep"
done

# ─────────────────────────────────────────────────────────────
# .gitignore racine
# ─────────────────────────────────────────────────────────────

section "Fichiers de configuration racine"

cat > .gitignore << 'EOF'
# Dépendances
node_modules/
.pnpm-store/

# Build
dist/
.next/
.turbo/
out/
build/

# Environnement — NE JAMAIS COMMITTER
.env
.env.local
.env.*.local
*.env

# Supabase
.supabase/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/settings.json
.idea/
*.swp

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Tests
coverage/
.vitest/

# Temp
tmp/
.cache/
EOF

success ".gitignore créé"

# ─────────────────────────────────────────────────────────────
# package.json racine (workspace pnpm)
# ─────────────────────────────────────────────────────────────

cat > package.json << 'EOF'
{
  "name": "teamovia",
  "version": "0.1.0",
  "private": true,
  "description": "Plateforme SaaS multi-agents Teamovia",
  "scripts": {
    "dev":         "turbo dev",
    "build":       "turbo build",
    "test":        "turbo test",
    "lint":        "turbo lint",
    "typecheck":   "turbo typecheck",
    "clean":       "turbo clean",
    "db:migrate":  "supabase db push",
    "db:seed":     "supabase db reset --linked",
    "db:types":    "supabase gen types typescript --local > packages/types/src/database.ts"
  },
  "devDependencies": {
    "turbo":       "^2.0.0",
    "typescript":  "^5.4.0",
    "@types/node": "^20.0.0",
    "vitest":      "^2.0.0"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  }
}
EOF

# pnpm workspace
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
  - 'services/*'
  - 'packages/*'
EOF

success "package.json + pnpm-workspace.yaml créés"

# ─────────────────────────────────────────────────────────────
# turbo.json
# ─────────────────────────────────────────────────────────────

cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
EOF

success "turbo.json créé"

# ─────────────────────────────────────────────────────────────
# TypeScript config partagée
# ─────────────────────────────────────────────────────────────

cat > tsconfig.base.json << 'EOF'
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target":           "ES2022",
    "lib":              ["ES2022"],
    "module":           "ESNext",
    "moduleResolution": "Bundler",
    "strict":           true,
    "noUncheckedIndexedAccess": true,
    "noImplicitAny":    true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck":     true,
    "esModuleInterop":  true,
    "resolveJsonModule": true,
    "declaration":      true,
    "declarationMap":   true,
    "sourceMap":        true,
    "paths": {
      "@teamovia/types":      ["./packages/types/src"],
      "@teamovia/ui":         ["./packages/ui/src"],
      "@teamovia/agents-sdk": ["./packages/agents-sdk/src"],
      "@teamovia/prompts":    ["./packages/prompts/src"],
      "@teamovia/config":     ["./packages/config/src"]
    }
  },
  "exclude": ["node_modules", "dist", ".next"]
}
EOF

success "tsconfig.base.json créé"

# ─────────────────────────────────────────────────────────────
# .env.example racine
# ─────────────────────────────────────────────────────────────

cat > .env.example << 'EOF'
# ── Supabase ──────────────────────────────────────────────────
# Récupérer depuis : https://app.supabase.com/project/_/settings/api
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhb...
SUPABASE_SERVICE_ROLE_KEY=eyJhb...   # NE JAMAIS EXPOSER CÔTÉ CLIENT

# ── Anthropic ─────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── Embeddings ────────────────────────────────────────────────
# Provider d'embedding pour la KB vectorielle
# Options : openai | voyage
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...                # si EMBEDDING_PROVIDER=openai

# ── n8n ───────────────────────────────────────────────────────
N8N_BASE_URL=https://votre-instance-n8n.app
N8N_API_KEY=...
N8N_WEBHOOK_SECRET=...               # secret partagé pour valider les webhooks entrants

# ── Stripe ────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ── App ───────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb...
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

success ".env.example créé"

# ─────────────────────────────────────────────────────────────
# Services : API backend
# ─────────────────────────────────────────────────────────────

section "Service API"

cat > services/api/package.json << 'EOF'
{
  "name": "@teamovia/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev":       "tsx watch src/index.ts",
    "build":     "tsc",
    "start":     "node dist/index.js",
    "test":      "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.43.0",
    "@ai-sdk/anthropic":     "^1.0.0",
    "ai":                    "^4.0.0",
    "hono":                  "^4.4.0",
    "zod":                   "^3.23.0",
    "@teamovia/types":       "workspace:*",
    "@teamovia/agents-sdk":  "workspace:*",
    "@teamovia/prompts":     "workspace:*",
    "@teamovia/config":      "workspace:*"
  },
  "devDependencies": {
    "tsx":          "^4.0.0",
    "typescript":   "^5.4.0",
    "vitest":       "^2.0.0",
    "@types/node":  "^20.0.0"
  }
}
EOF

cat > services/api/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
EOF

# Entrypoint Hono
cat > services/api/src/index.ts << 'EOF'
/**
 * Teamovia API — entrypoint
 * Framework : Hono (léger, typé, edge-ready)
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

const app = new Hono()

app.use('*', logger())
app.use('*', cors({
  origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  allowHeaders: ['Authorization', 'x-workspace-token', 'Content-Type'],
}))

app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }))

// TODO Phase 1 : monter les routes agents
// import { supportRoutes } from './routes/support'
// app.route('/agents/support', supportRoutes)

const port = Number(process.env.PORT ?? 3001)
console.log(`Teamovia API démarrée sur http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}
EOF

# Stub route support
cat > services/api/src/routes/support.ts << 'EOF'
/**
 * Routes Agent Support
 * TODO Phase 1 — implémenter après le middleware validate-workspace
 */
import { Hono } from 'hono'

export const supportRoutes = new Hono()

// POST /agents/support/sessions
supportRoutes.post('/sessions', async (c) => {
  return c.json({ message: 'TODO: créer une session support' }, 501)
})

// POST /agents/support/sessions/:id/message
supportRoutes.post('/sessions/:id/message', async (c) => {
  return c.json({ message: 'TODO: traiter un message' }, 501)
})
EOF

# Stub route sales
cat > services/api/src/routes/sales.ts << 'EOF'
/**
 * Routes Agent Ventes
 * TODO Phase 2
 */
import { Hono } from 'hono'

export const salesRoutes = new Hono()

salesRoutes.get('/leads', async (c) => {
  return c.json({ message: 'TODO: lister les leads' }, 501)
})
EOF

success "Service API créé"

# ─────────────────────────────────────────────────────────────
# Packages : types
# ─────────────────────────────────────────────────────────────

section "Package types"

cat > packages/types/package.json << 'EOF'
{
  "name": "@teamovia/types",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".":          "./src/index.ts",
    "./database": "./src/database.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
EOF

cat > packages/types/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
EOF

cat > packages/types/src/index.ts << 'EOF'
/**
 * Types partagés Teamovia
 * Générer les types DB avec : pnpm db:types
 */

export type WorkspaceRole  = 'owner' | 'admin' | 'viewer'
export type AgentType      = 'support' | 'sales'
export type ChannelType    = 'chat' | 'email' | 'form'
export type SessionStatus  = 'open' | 'resolved' | 'escalated' | 'transferred'
export type MessageRole    = 'user' | 'assistant' | 'system'
export type LeadStatus     = 'new' | 'qualifying' | 'qualified' | 'transferred' | 'lost'
export type LeadSource     = 'form' | 'chat' | 'email' | 'handoff' | 'import'
export type HandoffTarget  = 'support' | 'sales' | 'human'
export type PlanType       = 'starter' | 'pro' | 'enterprise'
export type SyncStatus     = 'pending' | 'success' | 'error'

export type LeadScore = {
  score:               number
  confidence:          'low' | 'medium' | 'high'
  dimensions: {
    besoin:            number
    budget:            number
    delai:             number
    decisionnaire:     number
  }
  reasons:             string[]
  disqualifiers:       string[]
  recommended_action:  'qualify' | 'nurture' | 'disqualify'
  next_step?:          string
}

export type WorkspaceContext = {
  workspaceId:   string
  userId:        string | null
  role:          WorkspaceRole | 'widget'
  workspaceName: string
  plan:          PlanType
  agentId?:      string
}

// Types API response
export type ApiError = {
  error: string
  code:  string
  details?: Record<string, unknown>
}

export type PaginatedResponse<T> = {
  data:       T[]
  pagination: {
    total:    number
    page:     number
    per_page: number
    has_more: boolean
  }
}
EOF

# Placeholder database types (généré par Supabase CLI)
cat > packages/types/src/database.ts << 'EOF'
/**
 * Types générés automatiquement depuis le schéma Supabase.
 * NE PAS MODIFIER MANUELLEMENT.
 *
 * Régénérer avec : pnpm db:types
 * (nécessite supabase CLI et un projet local ou lié)
 */
export type Database = {
  public: {
    Tables: {
      // Généré par : supabase gen types typescript
      // Lancer : pnpm db:types
    }
    Functions: {
      match_knowledge_chunks: {
        Args: {
          query_embedding:  number[]
          p_workspace_id:   string
          p_agent_id?:      string
          match_count?:     number
          min_similarity?:  number
        }
        Returns: Array<{
          id:         string
          content:    string
          source:     string
          source_ref: string | null
          metadata:   Record<string, unknown>
          similarity: number
        }>
      }
    }
  }
}
EOF

success "Package types créé"

# ─────────────────────────────────────────────────────────────
# Packages : agents-sdk
# ─────────────────────────────────────────────────────────────

section "Package agents-sdk"

cat > packages/agents-sdk/package.json << 'EOF'
{
  "name": "@teamovia/agents-sdk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@ai-sdk/anthropic":     "^1.0.0",
    "ai":                    "^4.0.0",
    "@supabase/supabase-js": "^2.43.0",
    "@teamovia/types":       "workspace:*",
    "@teamovia/prompts":     "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
EOF

cat > packages/agents-sdk/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
EOF

cat > packages/agents-sdk/src/index.ts << 'EOF'
/**
 * Agents SDK — abstractions partagées pour l'exécution des agents
 *
 * Exports :
 *  - createAgentRunner   : pipeline message → RAG → LLM → log
 *  - embedText           : génère un embedding pour un texte
 *  - matchKnowledge      : recherche dans la KB
 *  - writeAgentLog       : écrit un log dans agent_logs
 *  - getAgentMemory      : récupère la mémoire d'un utilisateur
 *  - updateAgentMemory   : met à jour la mémoire
 */

export { createAgentRunner }   from './runner'
export { embedText }           from './embeddings'
export { matchKnowledge }      from './knowledge'
export { writeAgentLog }       from './logs'
export { getAgentMemory,
         updateAgentMemory }   from './memory'
export { triggerN8nWebhook }   from './n8n'
EOF

# Runner stub
cat > packages/agents-sdk/src/runner.ts << 'EOF'
/**
 * createAgentRunner
 * Pipeline principal : contexte → RAG → LLM → log → actions
 * TODO Phase 1 — implémenter
 */
import type { WorkspaceContext } from '@teamovia/types'

export type AgentRunnerOptions = {
  agentType:   'support' | 'sales'
  sessionId?:  string
  leadId?:     string
  userMessage: string
  ctx:         WorkspaceContext
}

export type AgentRunnerResult = {
  text:            string
  tokensUsed:      number
  latencyMs:       number
  actionTriggered: string | null
}

export async function createAgentRunner(
  _options: AgentRunnerOptions
): Promise<AgentRunnerResult> {
  throw new Error('createAgentRunner: not implemented yet — Phase 1')
}
EOF

# Embeddings stub
cat > packages/agents-sdk/src/embeddings.ts << 'EOF'
/**
 * embedText
 * Génère un vecteur d'embedding pour un texte donné.
 * Provider configuré via EMBEDDING_PROVIDER (openai | voyage)
 * TODO Phase 1
 */
export async function embedText(_text: string): Promise<number[]> {
  throw new Error('embedText: not implemented yet — Phase 1')
}
EOF

# Knowledge stub
cat > packages/agents-sdk/src/knowledge.ts << 'EOF'
/**
 * matchKnowledge
 * Recherche les chunks pertinents dans la KB via RPC Supabase
 * TODO Phase 1
 */
export type KnowledgeChunk = {
  id:         string
  content:    string
  source:     string
  source_ref: string | null
  similarity: number
}

export async function matchKnowledge(
  _embedding:    number[],
  _workspaceId:  string,
  _agentId?:     string,
  _limit?:       number
): Promise<KnowledgeChunk[]> {
  throw new Error('matchKnowledge: not implemented yet — Phase 1')
}
EOF

# Logs stub
cat > packages/agents-sdk/src/logs.ts << 'EOF'
/**
 * writeAgentLog
 * Écrit un event dans agent_logs
 * TODO Phase 1
 */
export type LogEvent =
  | 'message_in' | 'message_out' | 'tool_call'
  | 'handoff'    | 'escalation'  | 'crm_sync' | 'error'

export async function writeAgentLog(
  _workspaceId: string,
  _agentId:     string | null,
  _sessionId:   string | null,
  _eventType:   LogEvent,
  _payload:     Record<string, unknown>,
  _meta?: { latencyMs?: number; tokensUsed?: number; modelUsed?: string }
): Promise<void> {
  throw new Error('writeAgentLog: not implemented yet — Phase 1')
}
EOF

# Memory stub
cat > packages/agents-sdk/src/memory.ts << 'EOF'
/**
 * Agent memory — lecture et mise à jour
 * TODO Phase 1
 */
export type AgentMemory = {
  facts:       Record<string, unknown>
  preferences: Record<string, unknown>
}

export async function getAgentMemory(
  _workspaceId: string,
  _agentId:     string,
  _userRef:     string
): Promise<AgentMemory | null> {
  return null // pas de mémoire en Phase 1 initiale
}

export async function updateAgentMemory(
  _workspaceId: string,
  _agentId:     string,
  _userRef:     string,
  _patch:       Partial<AgentMemory>
): Promise<void> {
  throw new Error('updateAgentMemory: not implemented yet — Phase 1')
}
EOF

# n8n trigger stub
cat > packages/agents-sdk/src/n8n.ts << 'EOF'
/**
 * triggerN8nWebhook
 * Déclenche un workflow n8n depuis le backend agent
 *
 * Convention de nommage des workflows :
 *   support-escalate    → escalade vers humain
 *   agent-handoff       → transfert inter-agents
 *   lead-crm-sync       → synchronisation CRM
 *   lead-sequence-start → démarrage séquence email
 */
export async function triggerN8nWebhook(
  workflowName: string,
  payload:      Record<string, unknown>
): Promise<void> {
  const baseUrl = process.env.N8N_BASE_URL
  const secret  = process.env.N8N_WEBHOOK_SECRET

  if (!baseUrl) {
    console.warn(`[n8n] N8N_BASE_URL non configuré — webhook '${workflowName}' ignoré`)
    return
  }

  const url = `${baseUrl}/webhook/${workflowName}`

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-webhook-secret': secret ?? '',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(
      `[n8n] Webhook '${workflowName}' failed: ${res.status} ${res.statusText}`
    )
  }
}
EOF

success "Package agents-sdk créé"

# ─────────────────────────────────────────────────────────────
# Packages : prompts
# ─────────────────────────────────────────────────────────────

section "Package prompts"

cat > packages/prompts/package.json << 'EOF'
{
  "name": "@teamovia/prompts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".":       "./src/index.ts",
    "./inject": "./src/inject.ts"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
EOF

cat > packages/prompts/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*", "*.md"]
}
EOF

cat > packages/prompts/src/index.ts << 'EOF'
export { buildSystemPrompt } from './inject'
EOF

cat > packages/prompts/src/inject.ts << 'EOF'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Injecte les variables runtime dans un prompt système.
 * Gère les blocs conditionnels {{#if VAR}}...{{else}}...{{/if}}
 */
export function buildSystemPrompt(
  agentName: 'support' | 'sales',
  variables: Record<string, string | undefined>
): string {
  const filePath = join(__dirname, '..', `agent-${agentName}.system.md`)
  const raw = readFileSync(filePath, 'utf-8')

  return raw
    // Blocs conditionnels avec else
    .replace(
      /\{\{#if (\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, key, ifBlock, elseBlock) =>
        variables[key] ? ifBlock.trim() : elseBlock.trim()
    )
    // Blocs conditionnels sans else
    .replace(
      /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, key, block) => (variables[key] ? block.trim() : '')
    )
    // Variables simples
    .replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '')
}
EOF

success "Package prompts créé"

# ─────────────────────────────────────────────────────────────
# Packages : config
# ─────────────────────────────────────────────────────────────

cat > packages/config/package.json << 'EOF'
{
  "name": "@teamovia/config",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "devDependencies": { "typescript": "^5.4.0" }
}
EOF

cat > packages/config/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
EOF

cat > packages/config/src/index.ts << 'EOF'
/**
 * Configuration centralisée Teamovia
 * Toutes les constantes et variables d'env passent par ici
 */

export const config = {
  supabase: {
    url:             process.env.SUPABASE_URL            ?? '',
    anonKey:         process.env.SUPABASE_ANON_KEY       ?? '',
    serviceRoleKey:  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },
  anthropic: {
    apiKey:          process.env.ANTHROPIC_API_KEY ?? '',
    defaultModel:    'claude-sonnet-4-6' as const,
    maxTokens:       4096,
  },
  embedding: {
    provider:        (process.env.EMBEDDING_PROVIDER ?? 'openai') as 'openai' | 'voyage',
    dimensions:      1536,
    minSimilarity:   0.5,
    defaultLimit:    5,
  },
  n8n: {
    baseUrl:         process.env.N8N_BASE_URL     ?? '',
    apiKey:          process.env.N8N_API_KEY      ?? '',
    webhookSecret:   process.env.N8N_WEBHOOK_SECRET ?? '',
  },
  app: {
    url:             process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    apiUrl:          process.env.API_URL             ?? 'http://localhost:3001',
  },
  quotas: {
    starter: { messages: 1000, leads: 200,  members: 3  },
    pro:     { messages: 5000, leads: 500,  members: 10 },
    enterprise: { messages: 50000, leads: 5000, members: 100 },
  },
} as const

export type Config = typeof config
EOF

success "Package config créé"

# ─────────────────────────────────────────────────────────────
# Dashboard app (Next.js stub)
# ─────────────────────────────────────────────────────────────

section "App Dashboard"

cat > apps/dashboard/package.json << 'EOF'
{
  "name": "@teamovia/dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev":       "next dev -p 3000",
    "build":     "next build",
    "start":     "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next":                  "^14.2.0",
    "react":                 "^18.3.0",
    "react-dom":             "^18.3.0",
    "@supabase/supabase-js": "^2.43.0",
    "@supabase/ssr":         "^0.4.0",
    "@teamovia/ui":          "workspace:*",
    "@teamovia/types":       "workspace:*",
    "@teamovia/config":      "workspace:*"
  },
  "devDependencies": {
    "@types/react":     "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript":       "^5.4.0",
    "tailwindcss":      "^3.4.0",
    "autoprefixer":     "^10.4.0",
    "postcss":          "^8.4.0"
  }
}
EOF

cat > apps/dashboard/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib":    ["ES2022", "DOM", "DOM.Iterable"],
    "jsx":    "preserve",
    "plugins": [{ "name": "next" }]
  },
  "include": ["src/**/*", "next.config.mjs", ".next/types/**/*.ts"]
}
EOF

mkdir -p apps/dashboard/src/app/\(dashboard\)
mkdir -p apps/dashboard/src/app/\(auth\)
mkdir -p apps/dashboard/src/app/api
mkdir -p apps/dashboard/src/components
mkdir -p apps/dashboard/src/lib

cat > apps/dashboard/src/app/layout.tsx << 'EOF'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Teamovia',
  description: 'Plateforme SaaS multi-agents',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
EOF

cat > apps/dashboard/src/app/page.tsx << 'EOF'
// TODO Phase 1 : rediriger vers /support ou /login selon l'état d'auth
export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Teamovia</h1>
      <p>Dashboard en construction — Phase 1</p>
      <ul>
        <li><a href="/support">Agent Support</a></li>
        <li><a href="/sales">Agent Ventes</a></li>
      </ul>
    </main>
  )
}
EOF

cat > apps/dashboard/src/lib/supabase.ts << 'EOF'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@teamovia/types/database'

/**
 * Client Supabase côté browser (anon key — RLS appliquée)
 * Usage : composants React, hooks, actions client
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
EOF

success "App Dashboard créée"

# ─────────────────────────────────────────────────────────────
# Fichiers Supabase
# ─────────────────────────────────────────────────────────────

section "Supabase"

cat > supabase/config.toml << 'EOF'
# Supabase local dev config
# Doc : https://supabase.com/docs/guides/cli/config

[api]
port = 54321
schemas = ["public"]
extra_search_path = ["public", "extensions"]

[db]
port = 54322
major_version = 15

[studio]
port = 54323

[inbucket]
port = 54324

[storage]
file_size_limit = "50MiB"

[auth]
# Hook : injection du workspace_id dans le JWT
# Configurer dans Dashboard > Auth > Hooks en production
site_url = "http://localhost:3000"
additional_redirect_urls = []
jwt_expiry = 3600
enable_signup = true

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = false

[functions]
EOF

cat > supabase/policies/README.md << 'EOF'
# RLS Policies — Guide de référence

## Principe d'isolation multi-tenant

Toutes les tables métier sont protégées par RLS.
L'isolation repose sur : `workspace_id = current_workspace_id()`

`current_workspace_id()` lit le claim `workspace_id` injecté dans le JWT
via un hook Auth déclenché à chaque connexion.

## Deux clients Supabase — règle absolue

| Client             | Clé              | Usage          | RLS       |
|--------------------|------------------|----------------|-----------|
| `createClient()`   | anon key         | Frontend       | Appliquée |
| `createServerClient()` | service role | Backend API    | Bypassée  |

## Hook Auth — injection workspace_id dans le JWT

Configurer dans Supabase Dashboard > Auth > Hooks (après déploiement) :

```sql
CREATE OR REPLACE FUNCTION auth.custom_claims(event jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  workspace_id uuid;
BEGIN
  SELECT wu.workspace_id INTO workspace_id
  FROM workspace_users wu
  WHERE wu.user_id = (event->>'user_id')::uuid
  ORDER BY CASE wu.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
  LIMIT 1;

  IF workspace_id IS NOT NULL THEN
    RETURN jsonb_set(event, '{claims,workspace_id}', to_jsonb(workspace_id));
  END IF;
  RETURN event;
END;
$$;
```

## Tests d'isolation obligatoires avant déploiement

1. User du workspace A ne peut pas lire les sessions du workspace B
2. Viewer ne peut pas modifier un agent
3. Widget token ne peut créer que des sessions
4. match_knowledge_chunks filtre bien par workspace_id
EOF

success "Supabase configuré"

# ─────────────────────────────────────────────────────────────
# n8n
# ─────────────────────────────────────────────────────────────

cat > n8n/credentials-schema/README.md << 'EOF'
# Credentials n8n — schéma attendu

Chaque credential doit être créé manuellement dans l'interface n8n.
Ce dossier documente les credentials requis par les workflows Teamovia.

## Credentials requis

### teamovia-api-webhook
- Type : Header Auth
- Name : x-webhook-secret
- Value : [valeur de N8N_WEBHOOK_SECRET dans .env]

### supabase-teamovia
- Type : Supabase API
- Host : [SUPABASE_URL]
- Service Role Key : [SUPABASE_SERVICE_ROLE_KEY]

### smtp-teamovia (pour les séquences email)
- Type : SMTP
- Configurer selon le provider email (SendGrid, Brevo, etc.)
EOF

# ─────────────────────────────────────────────────────────────
# Docs
# ─────────────────────────────────────────────────────────────

section "Documentation"

cat > docs/architecture/README.md << 'EOF'
# Architecture Teamovia

## Documents de référence

| Document | Description |
|---|---|
| `TEAMOVIA_ARCHITECTURE_v2.md` | Architecture officielle — source de vérité |
| `openapi.yaml` | Spec API complète (OpenAPI 3.1) |
| `../CLAUDE.md` | Instructions de travail pour Claude Code |

## Diagramme des couches

```
┌──────────────────────── PLATFORM CORE ────────────────────────┐
│  Auth · Workspaces · RBAC · KB · Billing · Logs · Monitoring  │
├──────────────────────── ORCHESTRATOR ─────────────────────────┤
│  n8n workflows · Agent router · Mémoire partagée cross-agents  │
├───────────────────────── AGENTS LAYER ────────────────────────┤
│  Agent support            │  Agent ventes                      │
│  Frontend · Backend · KB  │  Frontend · Backend · KB           │
└───────────────────────────────────────────────────────────────┘
```

## Stack

- Frontend  : Next.js 14 + Tailwind + shadcn/ui
- Backend   : Hono (TypeScript)
- Data      : Supabase (Postgres + pgvector + Auth + RLS)
- IA        : Anthropic Claude via AI SDK 7
- Workflows : n8n
- Monorepo  : Turborepo + pnpm workspaces
EOF

cat > docs/agents/support.md << 'EOF'
# Agent Support Client — Spec fonctionnelle

## Rôle
Répondre aux demandes entrantes (chat, email, formulaire),
chercher dans la KB, escalader si besoin, journaliser chaque action.

## Surfaces frontend
- Widget embarquable : `widget.teamovia.com/[workspace_id]`
- Dashboard opérateur : `app.teamovia.com/support`

## Routes API
- POST /agents/support/sessions
- POST /agents/support/sessions/:id/message  ← PRIORITÉ PHASE 1
- GET  /agents/support/sessions
- GET  /agents/support/sessions/:id
- PATCH /agents/support/sessions/:id
- POST /agents/support/sessions/:id/escalate
- POST /agents/support/kb
- POST /agents/support/kb/sync

## Checklist Phase 1
- [ ] Route POST /sessions
- [ ] Route POST /sessions/:id/message (RAG + LLM + log)
- [ ] Widget chat embarquable
- [ ] Dashboard sessions
- [ ] Workflow n8n : notification opérateur
EOF

cat > docs/agents/sales.md << 'EOF'
# Agent Ventes / Leads — Spec fonctionnelle

## Rôle
Qualifier les prospects entrants, scorer, enrichir, pousser dans le CRM.

## Routes API
- POST /agents/sales/leads
- POST /agents/sales/leads/:id/message
- POST /agents/sales/leads/:id/qualify
- GET  /agents/sales/leads
- GET  /agents/sales/leads/:id
- PATCH /agents/sales/leads/:id
- POST /agents/sales/leads/:id/sync-crm
- POST /agents/sales/leads/:id/sequence

## Checklist Phase 2
- [ ] Modèle leads opérationnel
- [ ] Scoring LLM avec structured output
- [ ] Frontend pipeline leads
- [ ] Sync CRM Airtable via n8n
- [ ] Séquences email
EOF

cat > docs/suivi/.gitkeep << ''

success "Documentation créée"

# ─────────────────────────────────────────────────────────────
# Copie des fichiers produits par Claude
# ─────────────────────────────────────────────────────────────

section "Copie des fichiers produits par Claude"

# Ce script suppose que les fichiers produits sont dans le même dossier
# ou dans un chemin relatif spécifié.
# Adapter CLAUDE_OUTPUT_DIR si nécessaire.

CLAUDE_OUTPUT_DIR="../claude-outputs"

if [ -d "$CLAUDE_OUTPUT_DIR" ]; then
  info "Dossier claude-outputs trouvé — copie en cours..."

  [ -f "$CLAUDE_OUTPUT_DIR/CLAUDE.md" ] && \
    cp "$CLAUDE_OUTPUT_DIR/CLAUDE.md" ./CLAUDE.md && \
    success "CLAUDE.md copié"

  [ -f "$CLAUDE_OUTPUT_DIR/TEAMOVIA_ARCHITECTURE_v2.md" ] && \
    cp "$CLAUDE_OUTPUT_DIR/TEAMOVIA_ARCHITECTURE_v2.md" docs/architecture/ && \
    success "TEAMOVIA_ARCHITECTURE_v2.md copié"

  [ -f "$CLAUDE_OUTPUT_DIR/openapi.yaml" ] && \
    cp "$CLAUDE_OUTPUT_DIR/openapi.yaml" docs/api/ && \
    success "openapi.yaml copié"

  [ -f "$CLAUDE_OUTPUT_DIR/supabase/migrations/001_initial_schema.sql" ] && \
    cp "$CLAUDE_OUTPUT_DIR/supabase/migrations/001_initial_schema.sql" supabase/migrations/ && \
    success "001_initial_schema.sql copié"

  [ -f "$CLAUDE_OUTPUT_DIR/supabase/seeds/001_demo_workspace.sql" ] && \
    cp "$CLAUDE_OUTPUT_DIR/supabase/seeds/001_demo_workspace.sql" supabase/seeds/ && \
    success "001_demo_workspace.sql copié"

  [ -f "$CLAUDE_OUTPUT_DIR/services/api/middleware/validate-workspace.ts" ] && \
    cp "$CLAUDE_OUTPUT_DIR/services/api/middleware/validate-workspace.ts" services/api/src/middleware/ && \
    success "validate-workspace.ts copié"

  [ -f "$CLAUDE_OUTPUT_DIR/services/api/middleware/validate-workspace.test.ts" ] && \
    cp "$CLAUDE_OUTPUT_DIR/services/api/middleware/validate-workspace.test.ts" services/api/src/middleware/ && \
    success "validate-workspace.test.ts copié"

  for f in "$CLAUDE_OUTPUT_DIR/prompts/"*.md; do
    [ -f "$f" ] && cp "$f" packages/prompts/ && success "$(basename "$f") copié"
  done
else
  warn "Dossier claude-outputs non trouvé ($CLAUDE_OUTPUT_DIR)"
  warn "Copier manuellement les fichiers téléchargés dans :"
  warn "  CLAUDE.md                      → $ROOT/CLAUDE.md"
  warn "  TEAMOVIA_ARCHITECTURE_v2.md    → $ROOT/docs/architecture/"
  warn "  openapi.yaml                   → $ROOT/docs/api/"
  warn "  001_initial_schema.sql         → $ROOT/supabase/migrations/"
  warn "  001_demo_workspace.sql         → $ROOT/supabase/seeds/"
  warn "  validate-workspace.ts          → $ROOT/services/api/src/middleware/"
  warn "  validate-workspace.test.ts     → $ROOT/services/api/src/middleware/"
  warn "  agent-support.system.md        → $ROOT/packages/prompts/"
  warn "  agent-sales.system.md          → $ROOT/packages/prompts/"
fi

# ─────────────────────────────────────────────────────────────
# README racine
# ─────────────────────────────────────────────────────────────

section "README racine"

cat > README.md << 'EOF'
# Teamovia

Plateforme SaaS multi-agents IA pour automatiser les workflows métier des PME, TPE et artisans.

## Agents MVP

| Agent | Rôle | Phase |
|---|---|---|
| Support client | Chat, FAQ, escalade, tickets | Phase 1 ✅ |
| Ventes / Leads | Qualification, scoring, CRM | Phase 2 |

## Stack

- **Frontend**  : Next.js 14 + Tailwind + shadcn/ui
- **Backend**   : Hono + TypeScript
- **Data**      : Supabase (Postgres + pgvector + Auth + RLS)
- **IA**        : Anthropic Claude via AI SDK 7
- **Workflows** : n8n
- **Monorepo**  : Turborepo + pnpm workspaces

## Démarrage rapide

```bash
# 1. Copier les variables d'environnement
cp .env.example .env
# Remplir les valeurs dans .env

# 2. Installer les dépendances
pnpm install

# 3. Démarrer Supabase en local
npx supabase start

# 4. Appliquer la migration initiale
pnpm db:migrate

# 5. Charger les données de démo
pnpm db:seed

# 6. Générer les types TypeScript depuis le schéma
pnpm db:types

# 7. Lancer le dev
pnpm dev
```

## Structure

```
apps/           Frontends (dashboard, widget support, pipeline ventes)
services/       Backend API + logique agents + intégrations
packages/       Code partagé (ui, types, agents-sdk, prompts, config)
supabase/       Migrations, seeds, functions, policies RLS
n8n/            Workflows exportés
docs/           Architecture, specs agents, API, suivi de session
tests/          Tests e2e et unitaires
```

## Documentation

- [Architecture](docs/architecture/TEAMOVIA_ARCHITECTURE_v2.md)
- [API](docs/api/openapi.yaml)
- [Agent Support](docs/agents/support.md)
- [Agent Ventes](docs/agents/sales.md)
- [Instructions Claude Code](CLAUDE.md)

## Phases d'implémentation

### Phase 1 — Socle + Agent Support
**Critère de sortie : boucle complète message → réponse → log en production**

- [ ] Schema Supabase v1 + RLS
- [ ] Middleware auth + quotas
- [ ] Route POST /agents/support/sessions/:id/message
- [ ] Widget chat embarquable
- [ ] Dashboard sessions + messages
- [ ] Workflow n8n : notification opérateur

### Phase 2 — Agent Ventes
**Critère de sortie : lead entrant → scoré → CRM**

### Phase 3 — Orchestration + Handoff
**Critère de sortie : prospect support → lead qualifié automatiquement**
EOF

success "README.md créé"

# ─────────────────────────────────────────────────────────────
# Git init + premier commit
# ─────────────────────────────────────────────────────────────

section "Git — initialisation"

git init -b main
git add .
git commit -m "chore: bootstrap monorepo Teamovia — Phase 1

- Arborescence complète (apps, services, packages, supabase, n8n, docs)
- Configuration Turborepo + pnpm workspaces
- Packages : types, agents-sdk, prompts, config
- Service API : Hono + middleware validate-workspace
- Supabase : migration 001 + seed démo + config RLS
- Documentation : architecture, agents, API
- README + .env.example
"

success "Premier commit Git créé"

# ─────────────────────────────────────────────────────────────
# Résumé final
# ─────────────────────────────────────────────────────────────

section "Bootstrap terminé"

echo ""
echo -e "${GREEN}✓ Monorepo Teamovia créé dans : $ROOT${NC}"
echo ""
echo "Arborescence :"
find . -not -path '*/node_modules/*' -not -path '*/.git/*' \
       -not -name '.gitkeep' -type f \
  | sort | sed 's|^./||' | sed 's|^|  |'

echo ""
echo -e "${BLUE}Prochaines étapes :${NC}"
echo ""
echo "  1. Copier les fichiers Claude téléchargés (si pas encore fait) :"
echo "     → CLAUDE.md, TEAMOVIA_ARCHITECTURE_v2.md, openapi.yaml"
echo "     → supabase/migrations/001_initial_schema.sql"
echo "     → supabase/seeds/001_demo_workspace.sql"
echo "     → services/api/src/middleware/validate-workspace.ts"
echo "     → packages/prompts/agent-support.system.md"
echo "     → packages/prompts/agent-sales.system.md"
echo ""
echo "  2. Remplir .env avec vos credentials Supabase et Anthropic"
echo "     cp .env.example .env"
echo ""
echo "  3. Installer les dépendances"
echo "     pnpm install"
echo ""
echo "  4. Démarrer Supabase en local"
echo "     npx supabase start"
echo ""
echo "  5. Appliquer la migration"
echo "     pnpm db:migrate"
echo ""
echo "  6. Générer les types TypeScript"
echo "     pnpm db:types"
echo ""
echo "  7. Lancer le dev"
echo "     pnpm dev"
echo ""
echo -e "${GREEN}Prêt pour la Phase 1 avec Claude Code.${NC}"
