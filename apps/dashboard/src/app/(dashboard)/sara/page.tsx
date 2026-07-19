/**
 * /sara — Dashboard Sara, Agent Ops
 */
'use client'

import { useState, useEffect } from 'react'
import DashboardShell, { T, AgentHeader, AGENTS, Btn, EmptyState, Card, Input, Badge } from '@/components/dashboard-shell'


const AGENT = { emoji: '⚙️', name: 'Sara', role: 'Agent Ops', color: '#16A34A', tags: ['Workflows', 'Onboarding', 'Coordination'] }
const API_URL         = 'http://127.0.0.1:8000/v1'
const WORKSPACE_TOKEN = 'b5299bf5-ad3a-4072-966e-8d4f4e94396e'
const N8N_BASE        = 'https://n8n.sportnest.fr'

const WORKFLOWS = [
  { id:'D44yZWmM0oG6Sx6b', name:'Notification Escalade',      icon:'⚠️', desc:"Alerte l'opérateur quand une session est escaladée",    endpoint:'escalate' },
  { id:'3lkm9scvJxdW0Psj', name:'Onboarding Lead Qualifié',   icon:'🎯', desc:"Notifie l'équipe + confirme au prospect",              endpoint:'lead-qualified' },
  { id:'e6nnYTIJBZQ6MSSR', name:'Relance Lead',               icon:'⏰', desc:"Alerte l'équipe + relance automatique du prospect",     endpoint:'lead-followup' },
]

const h = { 'Content-Type':'application/json', 'x-workspace-token': WORKSPACE_TOKEN }

export default function SaraPage() {
  const [logs,       setLogs]       = useState<any[]>([])
  const [active,     setActive]     = useState<string|null>(null)
  const [result,     setResult]     = useState<any|null>(null)
  const [error,      setError]      = useState('')

  const [sessId,     setSessId]     = useState('')
  const [priority,   setPriority]   = useState<'low'|'normal'|'high'>('high')
  const [leadId,     setLeadId]     = useState('')
  const [leadName,   setLeadName]   = useState('')
  const [leadEmail,  setLeadEmail]  = useState('')
  const [leadScore,  setLeadScore]  = useState(75)
  const [leadProject,setLeadProject]= useState('')
  const [daysIdle,   setDaysIdle]   = useState(3)

  async function trigger(endpoint: string, body: Record<string,unknown>) {
    setActive(endpoint); setResult(null); setError('')
    try {
      const res = await fetch(`${API_URL}/agents/sara/${endpoint}`,{method:'POST',headers:h,body:JSON.stringify(body)})
      const data = await res.json()
      setResult(data)
    } catch(e:any) { setError(e.message) } finally { setActive(null) }
  }

  function input(value: string, onChange: (v:string)=>void, placeholder: string, mono=false) {
    return (
      <input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{
          flex:1,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,
          padding:'8px 12px',color:T.textPrimary,fontSize:'13px',outline:'none',
          fontFamily: mono ? 'monospace' : T.fontBody,
        }} />
    )
  }

  return (
    <DashboardShell>
      <AgentHeader {...AGENT} stat={3} statLabel="workflows actifs" />
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* Sidebar workflows */}
        <div style={{width:'240px',flexShrink:0,borderRight:`1px solid ${T.border}`,padding:'16px 12px',background:T.bg,overflowY:'auto'}}>
          <div style={{fontSize:'11px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'12px'}}>Workflows n8n</div>
          {WORKFLOWS.map(wf => (
            <a key={wf.id} href={`${N8N_BASE}/workflow/${wf.id}`} target="_blank" rel="noopener noreferrer"
              style={{display:'block',padding:'10px 12px',background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,marginBottom:'6px',textDecoration:'none',transition:'200ms'}}>
              <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'4px'}}>
                <span style={{fontSize:'14px'}}>{wf.icon}</span>
                <span style={{fontSize:'12px',fontWeight:600,color:T.textPrimary}}>{wf.name}</span>
              </div>
              <div style={{fontSize:'11px',color:T.textSecond,lineHeight:'1.4'}}>{wf.desc}</div>
              <div style={{fontSize:'10px',color:AGENT.color,marginTop:'4px'}}>Ouvrir dans n8n →</div>
            </a>
          ))}
        </div>

        {/* Actions */}
        <div style={{flex:1,overflowY:'auto',padding:'20px 24px',background:T.bg,display:'flex',flexDirection:'column',gap:'12px'}}>
          {result && (
            <div style={{padding:'12px 16px',borderRadius:T.radiusSm,background:result.success?'#F0FDF4':'#FEF2F2',border:`1px solid ${result.success?'#BBF7D0':'#FECACA'}`,fontSize:'13px',color:result.success?T.success:T.danger}}>
              {result.success ? `✓ Workflow déclenché avec succès` : `✗ Erreur : ${result.error}`}
            </div>
          )}
          {error && <div style={{padding:'12px 16px',borderRadius:T.radiusSm,background:'#FEF2F2',border:'1px solid #FECACA',fontSize:'13px',color:T.danger}}>{error}</div>}

          {/* Escalade */}
          <Card padding="18px 20px">
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}}>
              <span style={{fontSize:'22px'}}>⚠️</span>
              <div>
                <div style={{fontSize:'14px',fontWeight:600,color:T.textPrimary}}>Escalader une session</div>
                <div style={{fontSize:'12px',color:T.textSecond}}>Notifie l'opérateur par email</div>
              </div>
            </div>
            <div style={{display:'flex',gap:'8px',marginBottom:'10px'}}>
              {input(sessId, setSessId, 'Session ID (UUID)', true)}
              <select value={priority} onChange={e=>setPriority(e.target.value as any)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,padding:'8px 12px',fontSize:'13px',color:T.textPrimary,outline:'none'}}>
                <option value="low">Basse</option>
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
              </select>
            </div>
            <Btn variant="danger" size="sm" onClick={()=>trigger('escalate',{session_id:sessId,priority})} loading={active==='escalate'} disabled={!sessId}>
              Déclencher
            </Btn>
          </Card>

          {/* Lead qualifié */}
          <Card padding="18px 20px">
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}}>
              <span style={{fontSize:'22px'}}>🎯</span>
              <div>
                <div style={{fontSize:'14px',fontWeight:600,color:T.textPrimary}}>Onboarding lead qualifié</div>
                <div style={{fontSize:'12px',color:T.textSecond}}>Notifie l'équipe + confirme au prospect</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'10px'}}>
              {input(leadId, setLeadId, 'Lead ID (UUID)', true)}
              {input(leadName, setLeadName, 'Nom du prospect')}
              {input(leadEmail, setLeadEmail, 'Email du prospect')}
              {input(leadProject, setLeadProject, 'Projet (ex: Escalier chêne)')}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}}>
              <span style={{fontSize:'12px',color:T.textSecond,flexShrink:0}}>Score :</span>
              <input type="range" min={0} max={100} value={leadScore} onChange={e=>setLeadScore(Number(e.target.value))} style={{flex:1}} />
              <span style={{fontSize:'14px',fontWeight:700,color:leadScore>=70?T.success:leadScore>=50?'#D97706':T.danger,minWidth:'36px'}}>{leadScore}</span>
            </div>
            <Btn variant="primary" size="sm" onClick={()=>trigger('lead-qualified',{lead_id:leadId,lead_name:leadName,lead_email:leadEmail,score:leadScore,project:leadProject})} loading={active==='lead-qualified'} disabled={!leadId||!leadName}>
              Déclencher
            </Btn>
          </Card>

          {/* Relance */}
          <Card padding="18px 20px">
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}}>
              <span style={{fontSize:'22px'}}>⏰</span>
              <div>
                <div style={{fontSize:'14px',fontWeight:600,color:T.textPrimary}}>Relance lead inactif</div>
                <div style={{fontSize:'12px',color:T.textSecond}}>Alerte l'équipe + relance le prospect</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'10px'}}>
              {input(leadId, setLeadId, 'Lead ID (UUID)', true)}
              {input(leadName, setLeadName, 'Nom du prospect')}
              {input(leadEmail, setLeadEmail, 'Email du prospect')}
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <span style={{fontSize:'12px',color:T.textSecond,flexShrink:0}}>Jours inactif :</span>
                <input type="number" min={1} max={30} value={daysIdle} onChange={e=>setDaysIdle(Number(e.target.value))}
                  style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,padding:'8px 12px',color:T.textPrimary,fontSize:'13px',outline:'none'}} />
              </div>
            </div>
            <Btn variant="accent" size="sm" onClick={()=>trigger('lead-followup',{lead_id:leadId,lead_name:leadName,lead_email:leadEmail,days_idle:daysIdle})} loading={active==='lead-followup'} disabled={!leadId||!leadName}>
              Déclencher
            </Btn>
          </Card>
        </div>
      </div>
    </DashboardShell>
  )
}
