'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from './settings.module.css'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Tab = 'workspace' | 'members' | 'agents' | 'integrations'

type Workspace = {
  id: string
  name: string
  escalation_config: Record<string, unknown>
}

type WorkspaceUser = {
  workspace_id: string
  user_id: string
  role: 'owner' | 'admin' | 'viewer'
  invited_at: string
  user?: { email: string }
}

type Agent = {
  id: string
  workspace_id: string
  type: 'support' | 'sales'
  name: string
  is_active: boolean
  config: Record<string, unknown>
}

type Integration = {
  id: string
  workspace_id: string
  provider: string
  name: string
  is_active: boolean
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('workspace')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [members, setMembers] = useState<WorkspaceUser[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // ── Charger données au montage ──────────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        // Workspace
        const { data: wsData } = await supabase
          .from('workspaces')
          .select('*')
          .limit(1)
          .single()

        if (wsData) setWorkspace(wsData as Workspace)

        // Membres
        const { data: membersData } = await supabase
          .from('workspace_users')
          .select('*, user:users(email)')

        if (membersData) setMembers(membersData as WorkspaceUser[])

        // Agents
        const { data: agentsData } = await supabase
          .from('agents')
          .select('*')

        if (agentsData) setAgents(agentsData as Agent[])

        // Intégrations
        const { data: integrationsData } = await supabase
          .from('integrations')
          .select('*')

        if (integrationsData) setIntegrations(integrationsData as Integration[])
      } catch (err) {
        console.error('Erreur chargement settings:', err)
      }
    }

    loadData()
  }, [supabase])

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Paramètres</h1>
      </div>

      {/* Navigation onglets */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'workspace' ? styles.active : ''}`}
          onClick={() => setTab('workspace')}
        >
          Workspace
        </button>
        <button
          className={`${styles.tab} ${tab === 'members' ? styles.active : ''}`}
          onClick={() => setTab('members')}
        >
          Membres
        </button>
        <button
          className={`${styles.tab} ${tab === 'agents' ? styles.active : ''}`}
          onClick={() => setTab('agents')}
        >
          Agents
        </button>
        <button
          className={`${styles.tab} ${tab === 'integrations' ? styles.active : ''}`}
          onClick={() => setTab('integrations')}
        >
          Intégrations
        </button>
      </div>

      {/* Contenu */}
      <div className={styles.content}>
        {tab === 'workspace' && (
          <WorkspaceTab
            workspace={workspace}
            setWorkspace={setWorkspace}
            supabase={supabase}
            isSaving={isSaving}
            setIsSaving={setIsSaving}
          />
        )}

        {tab === 'members' && (
          <MembersTab
            members={members}
            setMembers={setMembers}
            workspace={workspace}
            supabase={supabase}
          />
        )}

        {tab === 'agents' && (
          <AgentsTab
            agents={agents}
            setAgents={setAgents}
            supabase={supabase}
            isSaving={isSaving}
            setIsSaving={setIsSaving}
          />
        )}

        {tab === 'integrations' && (
          <IntegrationsTab
            integrations={integrations}
            setIntegrations={setIntegrations}
            supabase={supabase}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// WORKSPACE TAB
// ─────────────────────────────────────────────────────────────

function WorkspaceTab({
  workspace,
  setWorkspace,
  supabase,
  isSaving,
  setIsSaving,
}: {
  workspace: Workspace | null
  setWorkspace: (ws: Workspace) => void
  supabase: any
  isSaving: boolean
  setIsSaving: (b: boolean) => void
}) {
  const [name, setName] = useState(workspace?.name ?? '')
  const [escalationEmail, setEscalationEmail] = useState(
    (workspace?.escalation_config?.email as string) ?? ''
  )

  const handleSave = async () => {
    if (!workspace) return
    setIsSaving(true)

    try {
      const { data, error } = await supabase
        .from('workspaces')
        .update({
          name,
          escalation_config: { email: escalationEmail },
        })
        .eq('id', workspace.id)
        .select()
        .single()

      if (!error && data) {
        setWorkspace(data)
        alert('Workspace sauvegardé')
      }
    } catch (err) {
      console.error('Erreur sauvegarde:', err)
      alert('Erreur lors de la sauvegarde')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.formGroup}>
        <label className={styles.label}>Nom du workspace</label>
        <input
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Email équipe escalade</label>
        <input
          type="email"
          className={styles.input}
          value={escalationEmail}
          onChange={(e) => setEscalationEmail(e.target.value)}
        />
        <div className={styles.hint}>
          Email utilisé pour les notifications d'escalade
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.btnPrimary}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MEMBERS TAB
// ─────────────────────────────────────────────────────────────

function MembersTab({
  members,
  setMembers,
  workspace,
  supabase,
}: {
  members: WorkspaceUser[]
  setMembers: (m: WorkspaceUser[]) => void
  workspace: Workspace | null
  supabase: any
}) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'viewer'>('viewer')
  const [isInviting, setIsInviting] = useState(false)

  const handleInvite = async () => {
    if (!workspace || !inviteEmail) return
    setIsInviting(true)

    try {
      // Créer l'entrée workspace_users
      // Note : en prod, il faudrait créer un user Supabase ou envoyer une invitation
      const { error } = await supabase
        .from('workspace_users')
        .insert({
          workspace_id: workspace.id,
          user_id: `temp_${Date.now()}`, // Placeholder — à remplacer par vrai user_id
          role: inviteRole,
        })

      if (!error) {
        alert(`Invitation envoyée à ${inviteEmail}`)
        setInviteEmail('')
        setInviteRole('viewer')

        // Recharger la liste
        const { data } = await supabase
          .from('workspace_users')
          .select('*, user:users(email)')

        if (data) setMembers(data as WorkspaceUser[])
      }
    } catch (err) {
      console.error('Erreur invitation:', err)
      alert('Erreur lors de l\'invitation')
    } finally {
      setIsInviting(false)
    }
  }

  const handleRemove = async (userId: string) => {
    if (!workspace) return

    try {
      await supabase
        .from('workspace_users')
        .delete()
        .eq('workspace_id', workspace.id)
        .eq('user_id', userId)

      setMembers(members.filter(m => m.user_id !== userId))
    } catch (err) {
      console.error('Erreur suppression:', err)
      alert('Erreur lors de la suppression')
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.subsection}>
        <h3 className={styles.subtitle}>Inviter un membre</h3>

        <div className={styles.formGroup}>
          <label className={styles.label}>Email</label>
          <input
            type="email"
            className={styles.input}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Rôle</label>
          <select
            className={styles.input}
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'admin' | 'viewer')}
          >
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>

        <button
          className={styles.btnPrimary}
          onClick={handleInvite}
          disabled={isInviting}
        >
          {isInviting ? 'Envoi...' : 'Inviter'}
        </button>
      </div>

      <div className={styles.subsection}>
        <h3 className={styles.subtitle}>Membres actuels</h3>

        {members.length === 0 ? (
          <div className={styles.emptyState}>Aucun membre</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Rôle</th>
                <th>Invité le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.user_id}>
                  <td>{(member.user as any)?.email ?? 'unknown'}</td>
                  <td>{member.role}</td>
                  <td>{new Date(member.invited_at).toLocaleDateString('fr-FR')}</td>
                  <td>
                    <button
                      className={styles.btnDanger}
                      onClick={() => handleRemove(member.user_id)}
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AGENTS TAB
// ─────────────────────────────────────────────────────────────

function AgentsTab({
  agents,
  setAgents,
  supabase,
  isSaving,
  setIsSaving,
}: {
  agents: Agent[]
  setAgents: (a: Agent[]) => void
  supabase: any
  isSaving: boolean
  setIsSaving: (b: boolean) => void
}) {
  const [editingAgent, setEditingAgent] = useState<Partial<Agent> | null>(null)

  const handleSaveAgent = async (agent: Agent) => {
    setIsSaving(true)

    try {
      const { data, error } = await supabase
        .from('agents')
        .update({
          is_active: agent.is_active,
          config: agent.config,
        })
        .eq('id', agent.id)
        .select()
        .single()

      if (!error && data) {
        setAgents(agents.map(a => (a.id === agent.id ? data : a)))
        alert('Agent sauvegardé')
      }
    } catch (err) {
      console.error('Erreur sauvegarde agent:', err)
      alert('Erreur lors de la sauvegarde')
    } finally {
      setIsSaving(false)
      setEditingAgent(null)
    }
  }

  return (
    <div className={styles.section}>
      {agents.map((agent) => (
        <div key={agent.id} className={styles.agentCard}>
          <div className={styles.agentHeader}>
            <h3 className={styles.agentName}>
              {agent.type === 'support' ? '📞 Agent Support' : '💼 Agent Ventes'}
            </h3>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={agent.is_active}
                onChange={(e) => {
                  const updated = { ...agent, is_active: e.target.checked }
                  setEditingAgent(updated)
                }}
              />
              <span className={styles.toggleSlider}></span>
            </label>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Prompt override</label>
            <textarea
              className={styles.textarea}
              rows={4}
              value={
                (editingAgent?.id === agent.id
                  ? editingAgent?.config?.prompt_override
                  : agent.config?.prompt_override) as string || ''
              }
              onChange={(e) => {
                const updated = {
                  ...(editingAgent?.id === agent.id ? editingAgent : agent),
                  config: {
                    ...agent.config,
                    prompt_override: e.target.value,
                  },
                }
                setEditingAgent(updated)
              }}
              placeholder="Laisser vide pour le prompt par défaut"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Seuils scoring (JSON)</label>
            <textarea
              className={styles.textarea}
              rows={3}
              value={
                JSON.stringify(
                  editingAgent?.id === agent.id
                    ? editingAgent?.config?.scoring_thresholds
                    : agent.config?.scoring_thresholds,
                  null,
                  2
                ) || '{}'
              }
              onChange={(e) => {
                try {
                  const thresholds = JSON.parse(e.target.value)
                  const updated = {
                    ...(editingAgent?.id === agent.id ? editingAgent : agent),
                    config: {
                      ...agent.config,
                      scoring_thresholds: thresholds,
                    },
                  }
                  setEditingAgent(updated)
                } catch (err) {
                  // JSON invalide — ignorer
                }
              }}
              placeholder='{"min_score": 50}'
            />
          </div>

          {editingAgent?.id === agent.id && (
            <div className={styles.actions}>
              <button
                className={styles.btnPrimary}
                onClick={() => handleSaveAgent(editingAgent as Agent)}
                disabled={isSaving}
              >
                {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
              <button
                className={styles.btnSecondary}
                onClick={() => setEditingAgent(null)}
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// INTEGRATIONS TAB
// ─────────────────────────────────────────────────────────────

function IntegrationsTab({
  integrations,
  setIntegrations,
  supabase,
}: {
  integrations: Integration[]
  setIntegrations: (i: Integration[]) => void
  supabase: any
}) {
  const availableProviders = [
    'airtable',
    'hubspot',
    'pipedrive',
    'gmail',
    'slack',
    'webhook',
  ]

  const handleToggle = async (integration: Integration) => {
    try {
      if (integration.id) {
        // Update existing
        const { data, error } = await supabase
          .from('integrations')
          .update({ is_active: !integration.is_active })
          .eq('id', integration.id)
          .select()
          .single()

        if (!error && data) {
          setIntegrations(
            integrations.map(i => (i.id === integration.id ? data : i))
          )
        }
      } else {
        // Create new
        const { data, error } = await supabase
          .from('integrations')
          .insert({
            provider: integration.provider,
            name: integration.name,
            is_active: true,
          })
          .select()
          .single()

        if (!error && data) {
          setIntegrations([...integrations, data])
        }
      }
    } catch (err) {
      console.error('Erreur intégration:', err)
    }
  }

  return (
    <div className={styles.section}>
      {availableProviders.map((provider) => {
        const integration = integrations.find(i => i.provider === provider)

        return (
          <div key={provider} className={styles.integrationCard}>
            <div className={styles.integrationHeader}>
              <h3 className={styles.integrationName}>
                {provider.charAt(0).toUpperCase() + provider.slice(1)}
              </h3>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={integration?.is_active ?? false}
                  onChange={() =>
                    handleToggle(
                      integration || {
                        id: '',
                        workspace_id: '',
                        provider,
                        name: provider,
                        is_active: false,
                      }
                    )
                  }
                />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>

            {integration && (
              <div className={styles.integrationStatus}>
                Status: <span className={styles.statusBadge}>
                  {integration.is_active ? '✓ Actif' : '○ Inactif'}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
