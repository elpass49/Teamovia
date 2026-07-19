/**
 * /sales — Dashboard Noah, Agent Sales
 */
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import DashboardShell, { T, AgentHeader, AGENTS, Btn, EmptyState, Input, Badge } from '@/components/dashboard-shell'

const AGENT = { emoji: '📈', name: 'Noah', role: 'Agent Sales', color: '#D97706', tags: ['Pipeline', 'Relances', 'Propositions'] }
const API_URL         = 'http://127.0.0.1:8000/v1'
const WORKSPACE_TOKEN = 'b5299bf5-ad3a-4072-966e-8d4f4e94396e'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

type Lead = {
  id: string; email: string; name: string; company: string|null
  source: string; status: string; score: number|null; score_data: any; data: any; created_at: string
}
type Message = { id: string; role: string; content: string; created_at: string }

const STATUS_COLOR: Record<string,string> = {
  new:'#5A6472', qualifying:'#1E3A8A', qualified:'#16A34A', transferred:'#7C3AED', lost:'#DC2626'
}
const STATUS_LABEL: Record<string,string> = {
  new:'Nouveau', qualifying:'En qualification', qualified:'Qualifié', transferred:'Transféré', lost:'Perdu'
}

function ScoreBadge({ score }: { score: number|null }) {
  if (score === null) return <span style={{fontSize:'12px',color:T.textSecond}}>N/A</span>
  const color = score >= 70 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626'
  return (
    <span style={{
      fontSize:'13px',fontWeight:700,color,
      background:`${color}12`,padding:'2px 8px',borderRadius:'6px',
    }}>{score}</span>
  )
}

export default function SalesPage() {
  const [leads,    setLeads]    = useState<Lead[]>([])
  const [active,   setActive]   = useState<Lead|null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [filter,   setFilter]   = useState('all')
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [updating, setUpdating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb().from('leads').select('*').order('created_at',{ascending:false})
    if (filter!=='all') q = q.eq('status',filter)
    const { data } = await q
    setLeads((data??[]) as Lead[])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!active) { setMessages([]); return }
    sb().from('lead_messages').select('*').eq('lead_id',active.id).order('created_at',{ascending:true})
      .then(({data}) => setMessages((data??[]) as Message[]))
  }, [active])

  async function updateStatus(status: string) {
    if (!active||updating) return
    setUpdating(true)
    const res = await fetch(`${API_URL}/agents/sales/leads/${active.id}`,{
      method:'PATCH',headers:{'Content-Type':'application/json','x-workspace-token':WORKSPACE_TOKEN},
      body:JSON.stringify({status}),
    })
    if (res.ok) {
      setLeads(prev => prev.map(l => l.id===active.id ? {...l,status} : l))
      setActive(prev => prev ? {...prev,status} : null)
    }
    setUpdating(false)
  }

  async function qualifyAI() {
    if (!active||updating) return
    setUpdating(true)
    await fetch(`${API_URL}/agents/sales/leads/${active.id}/qualify`,{
      method:'POST',headers:{'Content-Type':'application/json','x-workspace-token':WORKSPACE_TOKEN},
    })
    await load()
    setUpdating(false)
  }

  const displayed = leads.filter(l => !search || `${l.name} ${l.email}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <DashboardShell>
<AgentHeader {...AGENT} stat={leads?.filter(l=>l.status==='qualified').length ?? 0} statLabel="actives" />
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* Liste leads */}
        <div style={{width:'276px',flexShrink:0,borderRight:`1px solid ${T.border}`,display:'flex',flexDirection:'column',background:T.bg}}>
          <div style={{padding:'10px 12px',borderBottom:`1px solid ${T.border}`,display:'flex',flexDirection:'column',gap:'8px'}}>
            <Input value={search} onChange={setSearch} placeholder="Rechercher..." />
            <select value={filter} onChange={e=>setFilter(e.target.value)} style={{
              background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,
              padding:'7px 10px',fontSize:'12px',color:T.textPrimary,outline:'none',
            }}>
              <option value="all">Tous les statuts</option>
              {Object.entries(STATUS_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {loading ? <div style={{padding:'24px',textAlign:'center',color:T.textSecond,fontSize:'13px'}}>Chargement...</div>
              : displayed.length===0 ? <EmptyState icon="📈" title="Aucun lead" />
              : displayed.map(l => (
                <button key={l.id} onClick={() => setActive(l)} style={{
                  width:'100%',textAlign:'left',padding:'11px 14px',
                  background: active?.id===l.id ? `${AGENT.color}08` : 'transparent',
                  borderLeft: active?.id===l.id ? `3px solid ${AGENT.color}` : '3px solid transparent',
                  border:'none',borderBottom:`1px solid ${T.border}`,cursor:'pointer',transition:'200ms',
                }}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'13px',fontWeight:600,color:T.textPrimary}}>{l.name}</span>
                    <ScoreBadge score={l.score} />
                  </div>
                  <div style={{fontSize:'11px',color:T.textSecond,marginTop:'2px'}}>{l.email}</div>
                  <div style={{marginTop:'4px',display:'flex',gap:'4px'}}>
                    <Badge label={STATUS_LABEL[l.status]??l.status} color={STATUS_COLOR[l.status]} />
                    <Badge label={l.source} />
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Fiche lead */}
        {active ? (
          <div style={{flex:1,overflowY:'auto',background:T.bg,padding:'20px 24px'}}>
            {/* Header lead */}
            <Card padding="16px 20px" style={{marginBottom:'16px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div>
                  <div style={{fontSize:'18px',fontWeight:700,fontFamily:T.fontHead,color:T.textPrimary}}>{active.name}</div>
                  <div style={{fontSize:'13px',color:T.textSecond,marginTop:'2px'}}>{active.email}</div>
                  {active.company && <div style={{fontSize:'12px',color:T.textSecond}}>{active.company}</div>}
                  <div style={{display:'flex',gap:'6px',marginTop:'8px',flexWrap:'wrap'}}>
                    <Badge label={STATUS_LABEL[active.status]??active.status} color={STATUS_COLOR[active.status]} />
                    <Badge label={active.source} />
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <ScoreBadge score={active.score} />
                  <div style={{fontSize:'10px',color:T.textSecond,marginTop:'4px'}}>Score</div>
                </div>
              </div>
              <div style={{display:'flex',gap:'8px',marginTop:'14px',flexWrap:'wrap'}}>
                <Btn variant="primary" size="sm" onClick={() => updateStatus('qualified')} loading={updating}>✓ Qualifier</Btn>
                <Btn variant="danger"  size="sm" onClick={() => updateStatus('lost')} loading={updating}>✗ Rejeter</Btn>
                <Btn variant="accent"  size="sm" onClick={qualifyAI} loading={updating}>🤖 IA</Btn>
                <Btn variant="ghost"   size="sm">🔗 Sync CRM</Btn>
              </div>
            </Card>

            {/* Données projet */}
            {active.data && Object.keys(active.data).length > 0 && (
              <Card padding="16px 20px" style={{marginBottom:'16px'}}>
                <div style={{fontSize:'12px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'10px'}}>Données projet</div>
                {Object.entries(active.data).map(([k,v]) => (
                  <div key={k} style={{display:'flex',gap:'8px',fontSize:'13px',marginBottom:'5px'}}>
                    <span style={{color:T.textSecond,minWidth:'120px'}}>{k}</span>
                    <span style={{color:T.textPrimary,fontWeight:500}}>{String(v)}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* Score data */}
            {active.score_data?.reasons && (
              <Card padding="16px 20px" style={{marginBottom:'16px'}}>
                <div style={{fontSize:'12px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'10px'}}>Analyse IA</div>
                {active.score_data.reasons?.map((r:string,i:number) => (
                  <div key={i} style={{fontSize:'13px',color:T.textPrimary,marginBottom:'4px'}}>✓ {r}</div>
                ))}
                {active.score_data.disqualifiers?.map((d:string,i:number) => (
                  <div key={i} style={{fontSize:'13px',color:T.danger,marginBottom:'4px'}}>✗ {d}</div>
                ))}
              </Card>
            )}

            {/* Historique messages */}
            {messages.length > 0 && (
              <Card padding="16px 20px">
                <div style={{fontSize:'12px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'12px'}}>Historique qualification</div>
                <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                  {messages.map(m => {
                    const isAgent = m.role==='assistant'
                    return (
                      <div key={m.id} style={{display:'flex',gap:'10px',alignItems:'flex-start'}}>
                        <div style={{
                          width:24,height:24,borderRadius:'50%',flexShrink:0,
                          background: isAgent ? AGENT.color : T.surfaceAlt,
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontSize:'11px',color: isAgent ? '#fff' : T.textSecond,fontWeight:600,
                          marginTop:'2px',
                        }}>{isAgent?'N':'U'}</div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:'13px',color:T.textPrimary,lineHeight:'1.5'}}>{m.content}</div>
                          <div style={{fontSize:'10px',color:T.textSecond,marginTop:'3px',fontFamily:'monospace'}}>
                            {new Date(m.created_at).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </div>
        ) : (
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:T.bg}}>
            <EmptyState icon="📈" title="Sélectionner un lead" subtitle="Cliquez sur un lead pour voir sa fiche." />
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
