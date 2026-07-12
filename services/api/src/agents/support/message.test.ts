/**
 * Tests de la route POST /agents/support/sessions/:sessionId/message
 *
 * Framework : Vitest
 * Lancer    : pnpm test services/api
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { messageRoute } from './message'

// ── Mocks ────────────────────────────────────────────────────

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: vi.fn().mockReturnValue({
      select:  vi.fn().mockReturnThis(),
      insert:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockReturnThis(),
      limit:   vi.fn().mockReturnThis(),
      range:   vi.fn().mockReturnThis(),
      single:  vi.fn(),
    }),
  }),
}))

vi.mock('@teamovia/agents-sdk', () => ({
  createAgentRunner: vi.fn(),
}))

vi.mock('../../middleware/validate-workspace', () => ({
  workspaceMiddleware: () => async (c: any, next: any) => {
    c.set('workspace', {
      workspaceId:   'ws-test-123',
      userId:        'user-test-456',
      role:          'admin',
      workspaceName: 'Test Workspace',
      plan:          'pro',
    })
    await next()
  },
}))

import { createAgentRunner } from '@teamovia/agents-sdk'
import { createClient }      from '@supabase/supabase-js'

// ── Setup app de test ─────────────────────────────────────────

function makeApp() {
  const app = new Hono()
  app.route('/agents/support', messageRoute)
  return app
}

// ── Helpers ───────────────────────────────────────────────────

function mockSupabaseChain(supabase: any, method: 'select' | 'insert', returnValue: any) {
  supabase.from.mockReturnValue({
    select:  vi.fn().mockReturnThis(),
    insert:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    order:   vi.fn().mockReturnThis(),
    limit:   vi.fn().mockReturnThis(),
    range:   vi.fn().mockReturnThis(),
    single:  vi.fn().mockResolvedValue(returnValue),
  })
}

// ─────────────────────────────────────────────────────────────

describe('POST /agents/support/sessions/:sessionId/message', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne la réponse de l\'agent pour un message valide', async () => {
    const supabase = (createClient as any)()

    // Mock : session valide
    supabase.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ single: () =>
        Promise.resolve({
          data:  { id: 'session-1', workspace_id: 'ws-test-123', status: 'open', user_ref: 'user@test.com' },
          error: null,
        })
      }) }) }),
    })
    // Mock : agent support trouvé
    .mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ single: () =>
        Promise.resolve({
          data: { id: 'agent-1', name: 'Support Test' },
          error: null,
        })
      }) }) }) }),
    })

    // Mock : runner
    ;(createAgentRunner as any).mockResolvedValue({
      text:            'Bonjour, je vous réponds au nom de Test Workspace.',
      tokensUsed:      150,
      latencyMs:       800,
      actionTriggered: null,
    })

    const app = makeApp()
    const res = await app.request(
      '/agents/support/sessions/session-1/message',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt' },
        body:    JSON.stringify({ content: 'Bonjour, j\'ai une question.' }),
      }
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message.role).toBe('assistant')
    expect(body.message.content).toContain('Test Workspace')
    expect(body.session_id).toBe('session-1')
    expect(body.action_triggered).toBeNull()
  })

  it('retourne 404 si la session est introuvable', async () => {
    const supabase = (createClient as any)()

    supabase.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ single: () =>
        Promise.resolve({ data: null, error: { message: 'not found' } })
      }) }) }),
    })

    const app = makeApp()
    const res = await app.request(
      '/agents/support/sessions/session-inexistante/message',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt' },
        body:    JSON.stringify({ content: 'test' }),
      }
    )

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('SESSION_NOT_FOUND')
  })

  it('retourne 404 si la session est déjà résolue', async () => {
    const supabase = (createClient as any)()

    supabase.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ single: () =>
        Promise.resolve({
          data: { id: 'session-1', workspace_id: 'ws-test-123', status: 'resolved', user_ref: null },
          error: null,
        })
      }) }) }),
    })

    const app = makeApp()
    const res = await app.request(
      '/agents/support/sessions/session-1/message',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt' },
        body:    JSON.stringify({ content: 'test' }),
      }
    )

    expect(res.status).toBe(404)
  })

  it('retourne 422 si le contenu est vide', async () => {
    const app = makeApp()
    const res = await app.request(
      '/agents/support/sessions/session-1/message',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt' },
        body:    JSON.stringify({ content: '' }),
      }
    )

    expect(res.status).toBe(422)
  })

  it('retourne 422 si le message dépasse 4000 caractères', async () => {
    const app = makeApp()
    const res = await app.request(
      '/agents/support/sessions/session-1/message',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt' },
        body:    JSON.stringify({ content: 'a'.repeat(4001) }),
      }
    )

    expect(res.status).toBe(422)
  })

  it('retourne un fallback 500 si le runner plante mais ne crashe pas', async () => {
    const supabase = (createClient as any)()

    supabase.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ single: () =>
        Promise.resolve({
          data: { id: 'session-1', workspace_id: 'ws-test-123', status: 'open', user_ref: null },
          error: null,
        })
      }) }) }),
    })
    .mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ single: () =>
        Promise.resolve({ data: { id: 'agent-1', name: 'Support Test' }, error: null })
      }) }) }) }),
    })

    ;(createAgentRunner as any).mockRejectedValue(new Error('LLM timeout'))

    const app = makeApp()
    const res = await app.request(
      '/agents/support/sessions/session-1/message',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt' },
        body:    JSON.stringify({ content: 'test' }),
      }
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    // Le message de fallback est retourné — l'utilisateur voit une réponse, pas une erreur brute
    expect(body.message).toBeDefined()
    expect(body.message.role).toBe('assistant')
  })

  it('expose action_triggered = HANDOFF_TO_SALES si détecté', async () => {
    const supabase = (createClient as any)()

    supabase.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ single: () =>
        Promise.resolve({
          data: { id: 'session-1', workspace_id: 'ws-test-123', status: 'open', user_ref: 'prospect@test.com' },
          error: null,
        })
      }) }) }),
    })
    .mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ single: () =>
        Promise.resolve({ data: { id: 'agent-1', name: 'Support Test' }, error: null })
      }) }) }) }),
    })

    ;(createAgentRunner as any).mockResolvedValue({
      text:            'Votre demande concerne l\'aspect commercial, je la transmets à l\'équipe en charge des ventes.',
      tokensUsed:      200,
      latencyMs:       950,
      actionTriggered: 'HANDOFF_TO_SALES',
    })

    const app = makeApp()
    const res = await app.request(
      '/agents/support/sessions/session-1/message',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-jwt' },
        body:    JSON.stringify({ content: 'Je voudrais un devis pour des fenêtres.' }),
      }
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.action_triggered).toBe('HANDOFF_TO_SALES')
  })
})
