/**
 * /settings — Paramètres workspace
 */
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import DashboardShell, { T, AgentHeader, Card, Btn, Input, Badge } from '@/components/dashboard-shell'

const AGENT = { label: 'Paramètres', emoji: '⚙', name: 'Paramètres', role: 'Configuration workspace', color: '#5A6472', tags: ['Workspace', 'Membres', 'Agents', 'Intégrations'] }

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

type Tab = 'workspace'|'members'|'agents'|'integrations'

const TABS: { id:Tab; label:string; icon:string }[] = [
  { id:'workspace',    label:'Workspace',    icon:'🏢' },
  { id:'members',      label:'Membres',      icon:'👥' },
  { id:'agents',       label:'Agents',       icon:'🤖' },
  { id:'integrations', label:'Intégrations', icon:'🔌' },
]

const INTEGRATIONS = [
  { id:'airtable',  name:'Airtable',   icon:'📋', desc:'Synchronisation de données' },
  { id:'hubspot',   name:'HubSpot',    icon:'🟠', desc:'CRM et pipeline commercial' },
  { id:'pipedrive', name:'Pipedrive',  icon:'🔵', desc:'Gestion des opportunités' },
  { id:'gmail',     name:'Gmail',      icon:'✉️',  desc:'Envoi d\'emails automatiques' },
  { id:'slack',     name:'Slack',      icon:'💬', desc:'Notifications équipe' },
  { id:'webhook',   name:'Webhook',    icon:'🔗', desc:'Intégration personnalisée' },
]

export default function SettingsPage() {
  const [tab,           setTab]           = useState<Tab>('workspace')
  const [saving,        setSaving]        = useState(false)
  const [saved,         setSaved]         = useState(false)
  const [error,         setError]         = useState('')

  // Workspace
  const [wsName,        setWsName]        = useState('Menuiserie Dubois')
  const [wsEmail,       setWsEmail]       = useState('contact@menuiserie-dubois.fr')
  const [wsEscalation,  setWsEscalation]  = useState('')

  // Members
  const [members,       setMembers]       = useState<any[]>([])
  const [inviteEmail,   setInviteEmail]   = useState('')
  const [inviteRole,    setInviteRole]    = useState<'admin'|'viewer'>('viewer')
  const [inviting] = useState(false)

  // Agents
  const [agents,        setAgents]        = useState<any[]>([])

  // Integrations
  const [activeInts,    setActiveInts]    = useState<Set<string>>(new Set())

  useEffect(() => {
    // Charger workspace
    sb().from('workspaces').select('*').eq('id', WORKSPACE_ID).single()
      .then(({data}) => {
        if (data) {
          setWsName(data.name ?? '')
          setWsEscalation((data.escalation_config as any)?.email ?? '')
        }
      })
    // Charger membres
    sb().from('workspace_users').select('*, users(email, full_name)').eq('workspace_id', WORKSPACE_ID)
      .then(({data}) => setMembers(data ?? []))
    // Charger agents
    sb().from('agents').select('*').eq('workspace_id', WORKSPACE_ID)
      .then(({data}) => setAgents(data ?? []))
    // Charger intégrations
    sb().from('integrations').select('*').eq('workspace_id', WORKSPACE_ID)
      .then(({data}) => {
        const active = new Set((data??[]).filter((i:any)=>i.is_active).map((i:any)=>i.type))
        setActiveInts(active)
      })
  }, [])

  async function saveWorkspace() {
    setSaving(true); setError('')
    const { error } = await sb().from('workspaces').update({
      name: wsName,
      escalation_config: { email: wsEscalation },
    }).eq('id', WORKSPACE_ID)
    if (error) setError(error.message)
    else { setSaved(true); setTimeout(()=>setSaved(false), 2000) }
    setSaving(false)
  }

  async function toggleIntegration(id: string) {
    const next = new Set(activeInts)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setActiveInts(next)
    // Upsert dans integrations
    await sb().from('integrations').upsert({
      workspace_id: WORKSPACE_ID,
      type: id,
      is_active: next.has(id),
    }, { onConflict: 'workspace_id,type' })
  }

  function section(title: string, children: React.ReactNode) {
    return (
      <div style={{marginBottom:'20px'}}>
        <div style={{fontSize:'11px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'12px'}}>{title}</div>
        {children}
      </div>
    )
  }

  function field(label: string, children: React.ReactNode) {
    return (
      <div style={{marginBottom:'14px'}}>
        <label style={{fontSize:'12px',fontWeight:500,color:T.textSecond,display:'block',marginBottom:'6px'}}>{label}</label>
        {children}
      </div>
    )
  }

  return (
    <DashboardShell>
      <AgentHeader {...AGENT} />
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* Tabs sidebar */}
        <div style={{width:'200px',flexShrink:0,borderRight:`1px solid ${T.border}`,padding:'16px 10px',background:T.bg}}>
          {TABS.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              width:'100%',textAlign:'left',padding:'8px 12px',borderRadius:T.radiusSm,
              border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:'8px',
              marginBottom:'2px',transition:'200ms',
              background: tab===t.id ? `${AGENT.color}10` : 'transparent',
              borderLeft: tab===t.id ? `3px solid ${AGENT.color}` : '3px solid transparent',
            }}>
              <span style={{fontSize:'14px'}}>{t.icon}</span>
              <span style={{fontSize:'13px',fontWeight:tab===t.id?600:500,color:tab===t.id?T.textPrimary:T.textSecond}}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{flex:1,overflowY:'auto',padding:'24px 28px',background:T.bg}}>

          {saved && <div style={{padding:'10px 14px',background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:T.radiusSm,fontSize:'13px',color:'#16A34A',marginBottom:'16px'}}>✓ Modifications enregistrées</div>}
          {error && <div style={{padding:'10px 14px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:T.radiusSm,fontSize:'13px',color:T.danger,marginBottom:'16px'}}>{error}</div>}

          {/* ── WORKSPACE ── */}
          {tab==='workspace' && (
            <Card padding="22px 24px">
              {section('Informations générales', <>
                {field('Nom du workspace',
                  <Input value={wsName} onChange={setWsName} placeholder="Nom de votre entreprise" />
                )}
                {field('Email principal',
                  <Input value={wsEmail} onChange={setWsEmail} placeholder="contact@entreprise.fr" />
                )}
              </>)}
              {section('Escalade', <>
                {field('Email d\'escalade (notifications support)',
                  <Input value={wsEscalation} onChange={setWsEscalation} placeholder="support@entreprise.fr" />
                )}
              </>)}
              <Btn variant="primary" onClick={saveWorkspace} loading={saving}>Enregistrer</Btn>
            </Card>
          )}

          {/* ── MEMBRES ── */}
          {tab==='members' && (
            <>
              <Card padding="22px 24px" style={{marginBottom:'16px'}}>
                {section('Inviter un membre', <>
                  <div style={{display:'flex',gap:'8px',alignItems:'flex-end'}}>
                    <div style={{flex:1}}>
                      {field('Email', <Input value={inviteEmail} onChange={setInviteEmail} placeholder="email@entreprise.fr" />)}
                    </div>
                    <div>
                      {field('Rôle',
                        <select value={inviteRole} onChange={e=>setInviteRole(e.target.value as any)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,padding:'8px 12px',fontSize:'13px',color:T.textPrimary,outline:'none',height:'36px'}}>
                          <option value="viewer">Lecteur</option>
                          <option value="admin">Administrateur</option>
                        </select>
                      )}
                    </div>
                    <Btn variant="primary" disabled={!inviteEmail||inviting} loading={inviting}>Inviter</Btn>
                  </div>
                </>)}
              </Card>

              <Card padding="0">
                <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,fontSize:'12px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.05em'}}>
                  Membres ({members.length})
                </div>
                {members.length===0 ? (
                  <div style={{padding:'24px',textAlign:'center',color:T.textSecond,fontSize:'13px'}}>Aucun membre</div>
                ) : members.map((m,i) => (
                  <div key={m.user_id} style={{padding:'12px 18px',borderBottom:i<members.length-1?`1px solid ${T.border}`:'none',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:T.primary,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700}}>
                        {(m.users?.full_name??m.users?.email??'?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{fontSize:'13px',fontWeight:600,color:T.textPrimary}}>{m.users?.full_name??m.users?.email??m.user_id.slice(0,8)}</div>
                        <div style={{fontSize:'11px',color:T.textSecond}}>{m.users?.email}</div>
                      </div>
                    </div>
                    <Badge label={m.role==='owner'?'Propriétaire':m.role==='admin'?'Admin':'Lecteur'} color={m.role==='owner'?T.primary:undefined} />
                  </div>
                ))}
              </Card>
            </>
          )}

          {/* ── AGENTS ── */}
          {tab==='agents' && (
            <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
              {agents.length===0 ? (
                <Card padding="24px">
                  <div style={{textAlign:'center',color:T.textSecond,fontSize:'13px'}}>Aucun agent configuré</div>
                </Card>
              ) : agents.map(agent => (
                <Card key={agent.id} padding="18px 20px">
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'14px'}}>
                    <div>
                      <div style={{fontSize:'15px',fontWeight:600,color:T.textPrimary}}>{agent.name}</div>
                      <div style={{fontSize:'12px',color:T.textSecond,marginTop:'2px'}}>{agent.type}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{fontSize:'12px',color:agent.is_active?'#16A34A':T.textSecond}}>{agent.is_active?'Actif':'Inactif'}</span>
                      <button
                        onClick={async()=>{
                          await sb().from('agents').update({is_active:!agent.is_active}).eq('id',agent.id)
                          setAgents(prev=>prev.map(a=>a.id===agent.id?{...a,is_active:!a.is_active}:a))
                        }}
                        style={{
                          width:36,height:20,borderRadius:T.radiusFull,border:'none',cursor:'pointer',
                          background:agent.is_active?'#16A34A':T.border,
                          position:'relative',transition:'200ms',padding:0,
                        }}
                      >
                        <span style={{
                          position:'absolute',top:2,width:16,height:16,borderRadius:'50%',background:'#fff',
                          left:agent.is_active?18:2,transition:'200ms',display:'block',
                        }} />
                      </button>
                    </div>
                  </div>
                  {field('Prompt override (optionnel)',
                    <textarea
                      defaultValue={(agent.config as any)?.prompt_override??''}
                      placeholder="Laissez vide pour utiliser le prompt système par défaut..."
                      rows={3}
                      style={{width:'100%',background:T.surfaceAlt,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,padding:'8px 12px',color:T.textPrimary,fontSize:'12px',lineHeight:'1.5',fontFamily:T.fontBody,resize:'vertical',outline:'none',boxSizing:'border-box'}}
                    />
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* ── INTÉGRATIONS ── */}
          {tab==='integrations' && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              {INTEGRATIONS.map(int => {
                const isActive = activeInts.has(int.id)
                return (
                  <Card key={int.id} padding="16px 18px" style={{borderLeft:`3px solid ${isActive?T.success:T.border}`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                        <span style={{fontSize:'22px'}}>{int.icon}</span>
                        <div>
                          <div style={{fontSize:'14px',fontWeight:600,color:T.textPrimary}}>{int.name}</div>
                          <div style={{fontSize:'11px',color:T.textSecond,marginTop:'2px'}}>{int.desc}</div>
                        </div>
                      </div>
                      <button
                        onClick={()=>toggleIntegration(int.id)}
                        style={{
                          width:36,height:20,borderRadius:T.radiusFull,border:'none',cursor:'pointer',
                          background:isActive?T.success:T.border,
                          position:'relative',transition:'200ms',padding:0,flexShrink:0,
                        }}
                      >
                        <span style={{
                          position:'absolute',top:2,width:16,height:16,borderRadius:'50%',background:'#fff',
                          left:isActive?18:2,transition:'200ms',display:'block',
                        }} />
                      </button>
                    </div>
                    {isActive && <div style={{marginTop:'8px'}}><Badge label="Actif" color={T.success} /></div>}
                  </Card>
                )
              })}
            </div>
          )}

        </div>
      </div>
    </DashboardShell>
  )
}
