/**
 * Tests du middleware validate-workspace
 * Couvrent les cas critiques d'auth, permissions et quotas
 *
 * Framework : Vitest
 * Lancer : pnpm test services/api/middleware/validate-workspace
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateWorkspace,
  requireRole,
  checkQuota,
  AuthError,
  PermissionError,
  QuotaError,
  type WorkspaceContext,
} from './validate-workspace'

// ── Mocks Supabase ────────────────────────────────────────────

const mockGetUser       = vi.fn()
const mockFrom          = vi.fn()
const mockSelect        = vi.fn()
const mockEq            = vi.fn()
const mockSingle        = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

// Helper : chaîne de query builder Supabase mockée
function mockQuery(returnValue: { data: any; error: any }) {
  mockSingle.mockResolvedValue(returnValue)
  mockEq.mockReturnValue({ eq: mockEq, single: mockSingle })
  mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle })
  mockFrom.mockReturnValue({ select: mockSelect })
}

// Helper : Request mock
function makeRequest(opts: {
  jwt?: string
  widgetToken?: string
}) {
  const headers = new Headers()
  if (opts.jwt) headers.set('Authorization', `Bearer ${opts.jwt}`)
  if (opts.widgetToken) headers.set('x-workspace-token', opts.widgetToken)
  return new Request('http://localhost/test', { headers })
}

// Contexte workspace valide pour les tests
const VALID_CTX: WorkspaceContext = {
  workspaceId:   'ws-123',
  userId:        'user-456',
  role:          'admin',
  workspaceName: 'Test Workspace',
  plan:          'pro',
}

// ─────────────────────────────────────────────────────────────

describe('validateWorkspace — JWT', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne le contexte workspace pour un JWT valide', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-456',
          app_metadata: { workspace_id: 'ws-123' },
        },
      },
      error: null,
    })

    // Mock workspace_users
    mockFrom.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ single: () =>
        Promise.resolve({ data: { role: 'admin' }, error: null })
      }) }) }),
    })

    // Mock workspaces
    mockFrom.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () =>
        Promise.resolve({ data: { id: 'ws-123', name: 'Test Workspace', plan: 'pro' }, error: null })
      }) }),
    })

    const request = makeRequest({ jwt: 'valid-jwt' })
    const ctx = await validateWorkspace(request)

    expect(ctx.workspaceId).toBe('ws-123')
    expect(ctx.role).toBe('admin')
    expect(ctx.plan).toBe('pro')
  })

  it('lève AuthError si JWT invalide', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })

    const request = makeRequest({ jwt: 'expired-jwt' })
    await expect(validateWorkspace(request)).rejects.toThrow(AuthError)
  })

  it('lève AuthError si workspace_id absent du JWT', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-456', app_metadata: {} } },
      error: null,
    })

    const request = makeRequest({ jwt: 'jwt-no-workspace' })
    await expect(validateWorkspace(request)).rejects.toThrow(AuthError)
  })

  it('lève AuthError si Authorization header absent', async () => {
    const request = makeRequest({})
    await expect(validateWorkspace(request)).rejects.toThrow(AuthError)
  })

  it('lève AuthError si l\'utilisateur n\'est pas membre du workspace', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-999', app_metadata: { workspace_id: 'ws-123' } } },
      error: null,
    })
    mockFrom.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ single: () =>
        Promise.resolve({ data: null, error: { message: 'not found' } })
      }) }) }),
    })

    const request = makeRequest({ jwt: 'jwt-not-member' })
    await expect(validateWorkspace(request)).rejects.toThrow(AuthError)
  })
})

// ─────────────────────────────────────────────────────────────

describe('validateWorkspace — Widget token', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne un contexte widget pour un token public valide', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () =>
        Promise.resolve({
          data: { id: 'ws-123', name: 'Test Workspace', plan: 'pro' },
          error: null,
        })
      }) }),
    })

    const request = makeRequest({ widgetToken: 'valid-public-token' })
    const ctx = await validateWorkspace(request, { allowWidget: true })

    expect(ctx.role).toBe('widget')
    expect(ctx.userId).toBeNull()
    expect(ctx.workspaceId).toBe('ws-123')
  })

  it('refuse le widget token si allowWidget = false (défaut)', async () => {
    const request = makeRequest({ widgetToken: 'any-token' })
    await expect(validateWorkspace(request)).rejects.toThrow(AuthError)
  })

  it('lève AuthError si le widget token est invalide', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () =>
        Promise.resolve({ data: null, error: { message: 'not found' } })
      }) }),
    })

    const request = makeRequest({ widgetToken: 'bad-token' })
    await expect(validateWorkspace(request, { allowWidget: true })).rejects.toThrow(AuthError)
  })
})

// ─────────────────────────────────────────────────────────────

describe('requireRole', () => {
  it('passe si le rôle est suffisant', () => {
    const ctx: WorkspaceContext = { ...VALID_CTX, role: 'admin' }
    expect(() => requireRole(ctx, 'viewer')).not.toThrow()
    expect(() => requireRole(ctx, 'admin')).not.toThrow()
  })

  it('lève PermissionError si le rôle est insuffisant', () => {
    const ctx: WorkspaceContext = { ...VALID_CTX, role: 'viewer' }
    expect(() => requireRole(ctx, 'admin')).toThrow(PermissionError)
    expect(() => requireRole(ctx, 'owner')).toThrow(PermissionError)
  })

  it('le rôle widget ne peut pas accéder aux routes protégées', () => {
    const ctx: WorkspaceContext = { ...VALID_CTX, role: 'widget', userId: null }
    expect(() => requireRole(ctx, 'viewer')).toThrow(PermissionError)
  })
})

// ─────────────────────────────────────────────────────────────

describe('checkQuota', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passe si le quota n\'est pas atteint', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () =>
        Promise.resolve({
          data: {
            quota_messages: 1000,
            quota_leads: 200,
            usage_messages: 450,
            usage_leads: 12,
            status: 'active',
          },
          error: null,
        })
      }) }),
    })

    await expect(checkQuota('ws-123', 'messages')).resolves.not.toThrow()
  })

  it('lève QuotaError si quota messages dépassé', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () =>
        Promise.resolve({
          data: {
            quota_messages: 1000,
            quota_leads: 200,
            usage_messages: 1000,
            usage_leads: 12,
            status: 'active',
          },
          error: null,
        })
      }) }),
    })

    await expect(checkQuota('ws-123', 'messages')).rejects.toThrow(QuotaError)
  })

  it('lève QuotaError si subscription inactive', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () =>
        Promise.resolve({
          data: {
            quota_messages: 1000,
            quota_leads: 200,
            usage_messages: 0,
            usage_leads: 0,
            status: 'cancelled',
          },
          error: null,
        })
      }) }),
    })

    await expect(checkQuota('ws-123', 'messages')).rejects.toThrow(QuotaError)
  })
})

// ─────────────────────────────────────────────────────────────

describe('isolation multi-tenant — cas critiques', () => {
  it('deux workspaces différents ne partagent pas le même contexte', async () => {
    // Ce test vérifie que le workspace_id extrait du JWT correspond bien
    // au workspace retourné par la base — pas de substitution possible

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-A',
          // L'utilisateur prétend appartenir au workspace B
          app_metadata: { workspace_id: 'ws-B' },
        },
      },
      error: null,
    })

    // La base retourne "not found" pour ws-B / user-A
    mockFrom.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ single: () =>
        Promise.resolve({ data: null, error: { message: 'not found' } })
      }) }) }),
    })

    const request = makeRequest({ jwt: 'jwt-user-A-claiming-ws-B' })
    await expect(validateWorkspace(request)).rejects.toThrow(AuthError)
  })
})
