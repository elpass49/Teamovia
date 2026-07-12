# Environment Setup Guide

## Overview

This document outlines all environment variables required to run Teamovia locally and in production.

## Files

- `.env.example` — Template (committed to repo)
- `.env.local` — Local configuration (git-ignored, never commit)

Copy `.env.example` to `.env.local` and fill in the values below.

---

## Required Variables (Must Configure)

### 1. Supabase — Database & Auth

**Why**: Teamovia uses Supabase for database, authentication, and realtime subscriptions.

**Setup**:
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Settings > API** to find your URL and keys
3. Fill in these values in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **Security**: `SUPABASE_SERVICE_ROLE_KEY` is secret — never expose it in browser code or version control.

**After setup**:
```bash
# Apply migrations to your Supabase database
npx supabase migration up
```

---

### 2. Anthropic — LLM Provider

**Why**: Powers both the support and sales agents with Claude models.

**Setup**:
1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Fill in `.env.local`:

```
ANTHROPIC_MODEL=claude-sonnet-4-6
```

**Model Options**:
| Model | Cost | Speed | Reasoning | Use Case |
|-------|------|-------|-----------|----------|
| `claude-opus-4-8` | High | Slow | Excellent | Complex decisions, deep analysis |
| `claude-sonnet-5` | Medium | Medium | Very Good | General-purpose (recommended for prod) |
| `claude-sonnet-4-6` | Medium | Medium | Good | **Default** — balanced cost/capability |
| `claude-haiku-4-5-20251001` | Low | Fast | Fair | High-volume tasks, light agents |

**Recommendation**: Start with `claude-sonnet-4-6` for development. Evaluate `claude-sonnet-5` for production if budget allows.

---

### 3. Embeddings — Vector Search Provider

**Why**: Used for knowledge base retrieval and semantic search in RAG.

**Setup**: Choose ONE provider:

#### Option A: OpenAI (Default)

1. Get API key from [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)
2. Fill in `.env.local`:

```
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-proj-...
```

**Model**: `text-embedding-3-small` (1536 dimensions)
**Cost**: ~$0.02 per 1M tokens
**Speed**: Fast

#### Option B: Voyage AI

1. Get API key from [voyageai.com](https://voyageai.com)
2. Fill in `.env.local`:

```
EMBEDDING_PROVIDER=voyage
VOYAGE_API_KEY=...
```

**Model**: `voyage-3-lite` (1024 dimensions)
**Cost**: Competitive with OpenAI
**Speed**: Very fast

⚠️ **Important**: Changing providers requires a SQL migration to update vector dimensions in `knowledge_chunks` table:
```sql
ALTER TABLE knowledge_chunks 
ALTER COLUMN embedding TYPE vector(1024);  -- if switching from OpenAI (1536) to Voyage (1024)
```

---

## Optional Variables (Configure Later)

### N8N — Workflow Automation

**Why**: Powers handoffs, escalations, CRM sync, and notifications.

**Setup** (can be skipped initially):

1. Deploy n8n:
   - Local: `docker run -it -p 5678:5678 n8nio/n8n`
   - Cloud: [cloud.n8n.io](https://cloud.n8n.io)

2. Fill in `.env.local`:

```
N8N_BASE_URL=http://localhost:5678
N8N_WEBHOOK_SECRET=your-secret-key
```

**If N8N_BASE_URL is empty**: Webhooks will fail gracefully with warnings (non-blocking).

---

## Local Development Checklist

- [ ] Supabase project created
- [ ] Supabase credentials in `.env.local`
- [ ] Supabase migrations applied (`npx supabase migration up`)
- [ ] Anthropic API key obtained
- [ ] Embedding provider chosen (OpenAI or Voyage)
- [ ] `.env.local` is in `.gitignore` (don't commit!)
- [ ] `.env.local` has all [REQUIRED] values filled

---

## Production Checklist

- [ ] All [REQUIRED] variables configured
- [ ] `.env.local` replaced with `.env.production.local` or production secret manager
- [ ] `ANTHROPIC_MODEL` evaluated (consider upgrading to `claude-sonnet-5`)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` stored securely (never in version control)
- [ ] n8n instance deployed and configured
- [ ] Database backups configured
- [ ] API rate limits and quotas verified

---

## Troubleshooting

### "SUPABASE_URL not configured"

**Cause**: Missing environment variable
**Fix**: Verify `NEXT_PUBLIC_SUPABASE_URL` is set in `.env.local`

### "OPENAI_API_KEY manquant"

**Cause**: Missing OpenAI key or wrong provider set
**Fix**: 
- Verify `EMBEDDING_PROVIDER=openai` 
- Get key from [platform.openai.com](https://platform.openai.com/account/api-keys)

### "Could not switch embedding provider"

**Cause**: Vector dimensions don't match
**Fix**: Run SQL migration to change vector(1536) ↔ vector(1024)

### "[n8n] webhook failed"

**Cause**: N8N_BASE_URL not configured or instance down
**Fix**: 
- Set `N8N_BASE_URL` to your n8n instance
- Or leave empty for now (webhooks fail gracefully)

---

## Security Best Practices

1. **Never commit `.env.local`** — it's in `.gitignore`
2. **Never log API keys** — they're sensitive
3. **Use separate keys for dev/staging/prod**
4. **Rotate `SUPABASE_SERVICE_ROLE_KEY` regularly**
5. **Store production secrets in a secret manager** (AWS Secrets, Vercel Env Vars, etc.)

---

## Reference

- Supabase Docs: https://supabase.com/docs
- Anthropic API Docs: https://docs.anthropic.com
- OpenAI Embeddings: https://platform.openai.com/docs/guides/embeddings
- Voyage AI: https://docs.voyageai.com
- n8n Docs: https://docs.n8n.io
