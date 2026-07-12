# 🚀 Getting Started with Teamovia

Welcome to Teamovia — an AI-powered multi-agent platform for support and sales automation.

## Quick Start (5 minutes)

### 1. Install Dependencies

```bash
npm install
# or
yarn install
```

### 2. Configure Environment

Copy the template and fill in your API keys:

```bash
# Template is already created at .env.local
# You need to fill in these values:
```

**Required values** (see `.env.local` for details):

| Variable | Source | Where |
|----------|--------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Settings > API > URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Settings > API > Service Role Key |
| `SUPABASE_ANON_KEY` | Supabase | Settings > API > Anon Key |
| `OPENAI_API_KEY` | OpenAI | platform.openai.com > API keys |

**Optional** (can configure later):
- `ANTHROPIC_MODEL` (default: `claude-sonnet-4-6`)
- `N8N_BASE_URL` (for workflow automation)

See `docs/ENV_SETUP.md` for complete documentation.

### 3. Setup Supabase Database

Follow the instructions in `SUPABASE_SETUP.md`:

```bash
npx supabase login
npx supabase link --project-ref jviynrkylpdijxpdemxv
npx supabase db push
```

This creates:
- 19 database tables
- Indexes and full-text search
- Vector embeddings for RAG
- RLS security policies
- Stored functions for metrics and search

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```
Teamovia/
├── apps/
│   ├── dashboard/          # Next.js admin dashboard
│   │   └── src/app/(dashboard)/
│   │       ├── support/    # Support sessions
│   │       ├── sales/      # Lead pipeline
│   │       ├── monitoring/ # Metrics & logs
│   │       └── settings/   # Workspace config
│   └── agent-support/      # Embeddable chat widget
│
├── services/
│   └── api/                # Next.js API routes
│       ├── agents/support/ # Support agent routes
│       ├── agents/sales/   # Sales agent routes
│       └── routes/         # Orchestration & handoff
│
├── packages/
│   ├── agents-sdk/         # Shared agent runtime
│   │   ├── embeddings.ts   # Vector generation
│   │   ├── knowledge.ts    # RAG & KB search
│   │   ├── runner.ts       # LLM orchestration
│   │   ├── ingest.ts       # KB ingestion
│   │   ├── logs.ts         # Activity logging
│   │   └── memory.ts       # Agent memory
│   ├── prompts/            # System prompts
│   └── types/              # Shared types
│
├── supabase/
│   ├── migrations/         # Database schema
│   ├── policies/           # RLS security rules
│   └── seeds/              # Demo data
│
└── docs/                   # Documentation
    ├── ENV_SETUP.md
    ├── ARCHITECTURE.md
    └── API.yaml
```

---

## Key Features

### 🤖 Multi-Agent System

- **Support Agent**: Handles customer inquiries with RAG
- **Sales Agent**: Qualifies leads with structured scoring
- **Orchestrator**: Routes between agents, manages handoffs

### 🧠 Intelligent Features

- Vector embeddings (OpenAI or Voyage AI)
- Knowledge base retrieval (RAG)
- Agent memory (per user, per session)
- Structured output scoring
- Real-time realtime subscriptions

### 📊 Dashboards

- **Support**: Session management, message history
- **Sales**: Lead pipeline with scoring
- **Monitoring**: Global metrics, event logs
- **Settings**: Workspace, members, agent config, integrations

### 🔗 Integrations

- Supabase (database & auth)
- Anthropic (LLM)
- OpenAI/Voyage (embeddings)
- n8n (workflows)

---

## Architecture Phases

### ✅ Phase 1: Support Agent

- Core infrastructure
- Support agent with RAG
- Session management
- Knowledge base
- Basic dashboard

### ✅ Phase 2: Sales Agent

- Lead qualification (structured scoring)
- Lead pipeline UI
- Message history
- CRM sync hooks

### ✅ Phase 3: Orchestration

- Inter-agent handoffs
- Global monitoring
- Workspace settings
- Member management

---

## Common Tasks

### Create a Workspace

```bash
# Via dashboard:
# 1. Go to http://localhost:3000
# 2. Click "Create Workspace"
# 3. Fill in name and escalation email
```

### Ingest Knowledge

```bash
# Programmatically:
const { ingestText } = require('@teamovia/agents-sdk')

await ingestText(
  'Your knowledge content here',
  workspaceId,
  agentId, // optional
  'manual'
)
```

### Test the Support Agent

```bash
# Via dashboard:
# 1. Open Support dashboard
# 2. Create a new session
# 3. Send a message
# 4. Agent responds using RAG + LLM
```

### Deploy to Vercel

```bash
vercel --prod
```

Ensure all env vars are set in Vercel project settings.

---

## Troubleshooting

### "SUPABASE_URL not configured"

Check `.env.local` has Supabase variables filled in.

### "Database connection failed"

Run `npx supabase db push` to apply migrations.

### "Embeddings API error"

- If using OpenAI: check `OPENAI_API_KEY`
- If using Voyage: check `VOYAGE_API_KEY`
- Ensure `EMBEDDING_PROVIDER` matches your chosen provider

### "LLM API error"

- Get API key from console.anthropic.com
- Check `ANTHROPIC_MODEL` is valid
- Verify API key is not expired

### "Realtime updates not working"

- Check Supabase is running
- Verify RLS policies are correct
- Check browser console for errors

---

## Next Steps

1. **Complete Setup**
   - Fill `.env.local` with API keys
   - Run `npx supabase db push`
   - Start dev server

2. **Create First Workspace**
   - Navigate to dashboard
   - Create workspace
   - Configure escalation email

3. **Test Support Agent**
   - Create a session
   - Send messages
   - Verify RAG retrieval

4. **Explore Other Features**
   - Create leads in Sales pipeline
   - Set up agent handoffs
   - Monitor activity in Monitoring page

5. **Deploy**
   - Push to GitHub
   - Deploy to Vercel
   - Set production env vars

---

## Documentation

- **Architecture**: See `TEAMOVIA_ARCHITECTURE_v2.md`
- **API**: See `openapi.yaml`
- **Environment**: See `docs/ENV_SETUP.md`
- **Supabase**: See `SUPABASE_SETUP.md`

---

## Support

For issues or questions:
1. Check `SUPABASE_SETUP.md` for database setup help
2. Check `docs/ENV_SETUP.md` for configuration
3. Check browser console and server logs
4. Review code comments in `services/api/` and `packages/agents-sdk/`

---

**Status**: Ready to use 🎉
**Last Updated**: 2026-07-12
**Phase**: 1-3 Complete (Support + Sales + Orchestration)
