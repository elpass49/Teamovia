/**
 * validate-workspace.ts
 * Middleware d'authentification et de validation workspace
 *
 * Responsabilités :
 *   1. Vérifier le JWT Supabase (Bearer token)
 *   2. Extraire et valider le workspace_id du JWT
 *   3. Vérifier que l'utilisateur appartient bien au workspace
 *   4. Vérifier les quotas du workspace (messages, leads)
 *   5. Attacher le contexte workspace à la requête
 *
 * Deux modes d'auth :
 *   - JWT Bearer (dashboard, API)
 *   - x-workspace-token (widget public embarquable)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@teamovia/types/database'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type WorkspaceRole = 'owner' | 'admin' | 'viewer'

export type WorkspaceContext = {
  workspaceId:  string
  userId:       string | null   // null pour les requêtes widget (token public)
  role:         WorkspaceRole | 'widget'
  workspaceName: string
  plan:         'starter' | 'pro' | 'enterprise'
  agentId?:     string          // injecté par les middlewares d'agent spécifiques
}

export type AuthMode = 'jwt' | 'widget'

// Extension de Request selon le framework (Hono, Express, Next.js)
// Adapter selon le framework utilisé
export interface AuthedRequest {
  workspace: WorkspaceContext
  supabase:  SupabaseClient<Database>
  authMode:  AuthMode
}

// ─────────────────────────────────────────────────────────────
// Clients Supabase
// ─────────────────────────────────────────────────────────────

/**
 * Client server-side avec service role key.
 * Bypass RLS — utiliser uniquement côté backend après validation manuelle du workspace.
 * NE JAMAIS exposer côté client.
 */
export function createServerClient(): SupabaseClient<Database> {
  const url  = process.env.SUPABASE_URL
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis. ' +
      'Vérifier les variables d\'environnement.'
    )
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  })
}

/**
 * Client avec le JWT de l'utilisateur.
 * RLS appliquée — utiliser pour les opérations où l'isolation tenant doit être garantie
 * par Supabase en plus du middleware.
 */
export function createUserClient(accessToken: string): SupabaseClient<Database> {
  const url     = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL et SUPABASE_ANON_KEY sont requis.')
  }

  return createClient<Database>(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { persistSession: false },
  })
}

// ─────────────────────────────────────────────────────────────
// Validation JWT — mode dashboard / API
// ─────────────────────────────────────────────────────────────

/**
 * Vérifie un JWT Supabase et retourne le contexte workspace.
 * Lève une AuthError si le token est invalide ou expiré.
 */
export async function validateJWT(
  token: string
): Promise<WorkspaceContext> {
  const supabase = createServerClient()

  // 1. Vérifier le JWT via Supabase Auth
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    throw new AuthError('Token invalide ou expiré', 'INVALID_TOKEN')
  }

  // 2. Extraire le workspace_id depuis les claims JWT custom
  //    (injecté par le hook Auth Supabase à la connexion)
  const workspaceId = user.app_metadata?.workspace_id as string | undefined

  if (!workspaceId) {
    throw new AuthError(
      'workspace_id absent du JWT. ' +
      'Vérifier que le hook Auth Supabase est configuré.',
      'MISSING_WORKSPACE_CLAIM'
    )
  }

  // 3. Vérifier que l'utilisateur appartient au workspace et récupérer son rôle
  const { data: membership, error: memberError } = await supabase
    .from('workspace_users')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (memberError || !membership) {
    throw new AuthError(
      'Utilisateur non membre de ce workspace',
      'NOT_WORKSPACE_MEMBER'
    )
  }

  // 4. Récupérer les infos du workspace
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('id, name, plan')
    .eq('id', workspaceId)
    .single()

  if (wsError || !workspace) {
    throw new AuthError('Workspace introuvable', 'WORKSPACE_NOT_FOUND')
  }

  return {
    workspaceId,
    userId:        user.id,
    role:          membership.role as WorkspaceRole,
    workspaceName: workspace.name,
    plan:          workspace.plan as WorkspaceContext['plan'],
  }
}

// ─────────────────────────────────────────────────────────────
// Validation Widget — mode token public embarquable
// ─────────────────────────────────────────────────────────────

/**
 * Vérifie un x-workspace-token (token public du widget support).
 * Permissions réduites : création de sessions et envoi de messages uniquement.
 */
export async function validateWidgetToken(
  token: string
): Promise<WorkspaceContext> {
  const supabase = createServerClient()

  // Le token est le `public_token` UUID stocké dans workspaces
  const { data: workspace, error } = await supabase
    .from('workspaces')
    .select('id, name, plan')
    .eq('public_token', token)
    .single()

  if (error || !workspace) {
    throw new AuthError(
      'Token widget invalide ou workspace introuvable',
      'INVALID_WIDGET_TOKEN'
    )
  }

  return {
    workspaceId:   workspace.id,
    userId:        null,   // pas d'utilisateur Teamovia identifié
    role:          'widget',
    workspaceName: workspace.name,
    plan:          workspace.plan as WorkspaceContext['plan'],
  }
}

// ─────────────────────────────────────────────────────────────
// Vérification des quotas
// ─────────────────────────────────────────────────────────────

export type QuotaType = 'messages' | 'leads'

/**
 * Vérifie que le workspace n'a pas dépassé son quota.
 * Les triggers SQL incrémentent les compteurs automatiquement.
 * Ce middleware vérifie avant d'autoriser l'action.
 */
export async function checkQuota(
  workspaceId: string,
  type: QuotaType
): Promise<void> {
  const supabase = createServerClient()

  const { data: sub, error } = await supabase
    .from('subscriptions')
    .select('quota_messages, quota_leads, usage_messages, usage_leads, status')
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !sub) {
    // Pas de subscription = plan gratuit avec quotas minimaux
    // En production, rediriger vers onboarding
    throw new QuotaError('Subscription introuvable', 'NO_SUBSCRIPTION')
  }

  if (sub.status !== 'active') {
    throw new QuotaError('Subscription inactive ou expirée', 'SUBSCRIPTION_INACTIVE')
  }

  if (type === 'messages' && sub.usage_messages >= sub.quota_messages) {
    throw new QuotaError(
      `Quota messages atteint (${sub.usage_messages}/${sub.quota_messages})`,
      'QUOTA_MESSAGES_EXCEEDED'
    )
  }

  if (type === 'leads' && sub.usage_leads >= sub.quota_leads) {
    throw new QuotaError(
      `Quota leads atteint (${sub.usage_leads}/${sub.quota_leads})`,
      'QUOTA_LEADS_EXCEEDED'
    )
  }
}

// ─────────────────────────────────────────────────────────────
// Vérification des permissions par rôle
// ─────────────────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<WorkspaceRole | 'widget', number> = {
  owner:  3,
  admin:  2,
  viewer: 1,
  widget: 0,
}

/**
 * Vérifie que le rôle du contexte courant est au moins `minRole`.
 * Lève une PermissionError sinon.
 */
export function requireRole(
  ctx: WorkspaceContext,
  minRole: WorkspaceRole
): void {
  const currentLevel = ROLE_HIERARCHY[ctx.role]
  const requiredLevel = ROLE_HIERARCHY[minRole]

  if (currentLevel < requiredLevel) {
    throw new PermissionError(
      `Rôle insuffisant. Requis : ${minRole}, actuel : ${ctx.role}`,
      'INSUFFICIENT_ROLE'
    )
  }
}

/**
 * Vérifie que le mode d'auth est JWT (pas widget).
 * Utilisé pour les routes réservées aux utilisateurs Teamovia identifiés.
 */
export function requireJWTAuth(ctx: WorkspaceContext): void {
  if (ctx.role === 'widget' || ctx.userId === null) {
    throw new PermissionError(
      'Cette route requiert une authentification JWT',
      'JWT_REQUIRED'
    )
  }
}

// ─────────────────────────────────────────────────────────────
// Middleware principal — adaptateur framework-agnostique
// ─────────────────────────────────────────────────────────────

export type ValidateWorkspaceOptions = {
  /** Quota à vérifier avant de passer la main. Undefined = pas de vérification. */
  quota?:   QuotaType
  /** Rôle minimum requis. Undefined = viewer suffit. */
  minRole?: WorkspaceRole
  /** Si true, autorise le mode widget (x-workspace-token). Default: false */
  allowWidget?: boolean
}

/**
 * Valide la requête et retourne le contexte workspace.
 * Conçu pour être appelé au début de chaque handler de route.
 *
 * Usage avec Hono :
 *   const ctx = await validateWorkspace(c.req.raw, { quota: 'messages' })
 *
 * Usage avec Next.js App Router :
 *   const ctx = await validateWorkspace(request, { minRole: 'admin' })
 */
export async function validateWorkspace(
  request: Request,
  options: ValidateWorkspaceOptions = {}
): Promise<WorkspaceContext> {
  const { quota, minRole, allowWidget = false } = options

  // ── 1. Extraire le token ──────────────────────────────────
  const authHeader    = request.headers.get('Authorization')
  const widgetToken   = request.headers.get('x-workspace-token')

  let ctx: WorkspaceContext
  let authMode: AuthMode

  if (widgetToken && allowWidget) {
    // Mode widget — token public
    ctx      = await validateWidgetToken(widgetToken)
    authMode = 'widget'
  } else if (authHeader?.startsWith('Bearer ')) {
    // Mode JWT — utilisateur Teamovia
    const token = authHeader.slice(7)
    ctx         = await validateJWT(token)
    authMode    = 'jwt'
  } else {
    throw new AuthError(
      'Authorization header manquant. Format attendu : Bearer <token>',
      'MISSING_AUTH_HEADER'
    )
  }

  // ── 2. Vérifier le rôle minimum ──────────────────────────
  if (minRole) {
    requireRole(ctx, minRole)
  }

  // ── 3. Vérifier les quotas ────────────────────────────────
  if (quota) {
    await checkQuota(ctx.workspaceId, quota)
  }

  return ctx
}

// ─────────────────────────────────────────────────────────────
// Adaptateurs framework
// ─────────────────────────────────────────────────────────────

/**
 * Adaptateur Hono — retourne un middleware Hono typé.
 *
 * Usage :
 *   app.post('/agents/support/sessions/:id/message',
 *     workspaceMiddleware({ quota: 'messages', allowWidget: true }),
 *     async (c) => {
 *       const ctx = c.get('workspace')
 *       ...
 *     }
 *   )
 */
export function workspaceMiddleware(options: ValidateWorkspaceOptions = {}) {
  return async (c: any, next: () => Promise<void>) => {
    try {
      const ctx = await validateWorkspace(c.req.raw, options)
      c.set('workspace', ctx)
      await next()
    } catch (error) {
      if (error instanceof AuthError) {
        return c.json({ error: error.message, code: error.code }, 401)
      }
      if (error instanceof PermissionError) {
        return c.json({ error: error.message, code: error.code }, 403)
      }
      if (error instanceof QuotaError) {
        return c.json({ error: error.message, code: error.code }, 429)
      }
      throw error
    }
  }
}

/**
 * Adaptateur Next.js App Router.
 *
 * Usage :
 *   export async function POST(request: Request) {
 *     const ctx = await withWorkspace(request, { quota: 'messages' })
 *     if (ctx instanceof Response) return ctx  // erreur auth
 *     ...
 *   }
 */
export async function withWorkspace(
  request: Request,
  options: ValidateWorkspaceOptions = {}
): Promise<WorkspaceContext | Response> {
  try {
    return await validateWorkspace(request, options)
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message, code: error.code }, { status: 401 })
    }
    if (error instanceof PermissionError) {
      return Response.json({ error: error.message, code: error.code }, { status: 403 })
    }
    if (error instanceof QuotaError) {
      return Response.json({ error: error.message, code: error.code }, { status: 429 })
    }
    throw error
  }
}

// ─────────────────────────────────────────────────────────────
// Erreurs typées
// ─────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'AuthError'
  }
}

export class PermissionError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'PermissionError'
  }
}

export class QuotaError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'QuotaError'
  }
}
