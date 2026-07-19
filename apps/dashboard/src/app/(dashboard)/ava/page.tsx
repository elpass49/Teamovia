/**
 * /ava — Dashboard Ava, Agent Conversationnel
 * (même structure que support — conversations Ava)
 */
'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import DashboardShell, { T, AgentHeader, AGENTS, EmptyState, Input, Badge } from '@/components/dashboard-shell'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

type Session = { id: string; user_ref: string|null; status: string; updated_at: string }
type Message = { id: string; role: string; content: string; tokens_used: number|null; latency_ms: number|null; created_at: string }

const STATUS_COLOR: Record<string,string> = { open:'#0891B2', resolved:'#16A34A', escalated:'#DC2626', transferred:'#D97706' }
const STATUS_LABEL: Record<string,string> = { open:'Ouverte', resolved:'Résolue', escalated:'Escaladée', transferred:'Transférée' }

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60000) return "À l'instant"
  if (d < 3600000) return `${Math.floor(d/60000)}m`
  return `${Math.floor(d/3600000)}h`
}
const AGENT = AGENTS.find(a => a.href === '/ava') ?? AGENTS[0]
const AVA_AGENT_ID = '00000000-0000-0000-0000-000000000022'

export default function AvaPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [active,   setActive]   = useState<Session|null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb().from('sessions').select('*')
      .eq('agent_id', AVA_AGENT_ID).order('updated_at',{ascending:false})
    setSessions((data??[]) as Session[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!active) { setMessages([]); return }
    sb().from('messages').select('*').eq('session_id',active.id).order('created_at',{ascending:true})
      .then(({data}) => setMessages((data??[]) as Message[]))
  }, [active])

  useEffect(() => { endRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  const displayed = sessions.filter(s => !search || (s.user_ref??'').toLowerCase().includes(search.toLowerCase()))

  return (
    <DashboardShell>
      <AgentHeader {...AGENT} stat={sessions.filter(s=>s.status==='open').length} statLabel="actives" />
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={{width:'276px',flexShrink:0,borderRight:`1px solid ${T.border}`,display:'flex',flexDirection:'column',background:T.bg}}>
          <div style={{padding:'10px 12px',borderBottom:`1px solid ${T.border}`}}>
            <Input value={search} onChange={setSearch} placeholder="Rechercher..." />
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {loading ? <div style={{padding:'24px',textAlign:'center',color:T.textSecond,fontSize:'13px'}}>Chargement...</div>
              : displayed.length===0 ? <EmptyState icon="✨" title="Aucune conversation" />
              : displayed.map(s => (
                <button key={s.id} onClick={()=>setActive(s)} style={{
                  width:'100%',textAlign:'left',padding:'11px 14px',
                  background: active?.id===s.id ? `${AGENT.color}08` : 'transparent',
                  borderLeft: active?.id===s.id ? `3px solid ${AGENT.color}` : '3px solid transparent',
                  border:'none',borderBottom:`1px solid ${T.border}`,cursor:'pointer',transition:'200ms',
                }}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'13px',fontWeight:600,color:T.textPrimary}}>{s.user_ref??'Visiteur'}</span>
                    <span style={{fontSize:'10px',color:T.textSecond,fontFamily:'monospace'}}>{timeAgo(s.updated_at)}</span>
                  </div>
                  <div style={{marginTop:'4px'}}><Badge label={STATUS_LABEL[s.status]??s.status} color={STATUS_COLOR[s.status]} /></div>
                </button>
              ))}
          </div>
        </div>

        {active ? (
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'12px 20px',background:T.surface,borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
              <div>
                <div style={{fontSize:'14px',fontWeight:600,color:T.textPrimary}}>{active.user_ref??'Visiteur'}</div>
                <div style={{fontSize:'11px',color:T.textSecond,marginTop:'2px',fontFamily:'monospace'}}>{active.id.slice(0,8)}...</div>
              </div>
              <Badge label={STATUS_LABEL[active.status]??active.status} color={STATUS_COLOR[active.status]} />
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'20px',display:'flex',flexDirection:'column',gap:'10px',background:T.bg}}>
              {messages.map(m => {
                const isUser = m.role==='user'
                return (
                  <div key={m.id} style={{display:'flex',flexDirection:'column',maxWidth:'78%',gap:'3px',alignSelf:isUser?'flex-end':'flex-start',alignItems:isUser?'flex-end':'flex-start'}}>
                    <div style={{
                      padding:'10px 14px',
                      borderRadius: isUser ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                      background: isUser ? T.surfaceAlt : AGENT.color,
                      color: isUser ? T.textPrimary : '#fff',
                      fontSize:'13.5px',lineHeight:'1.55',whiteSpace:'pre-wrap',wordBreak:'break-word',
                    }}>{m.content}</div>
                    <div style={{fontSize:'10px',color:T.textSecond,fontFamily:'monospace',display:'flex',gap:'8px'}}>
                      <span>{new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
                      {m.tokens_used!=null&&<span>{m.tokens_used} tokens</span>}
                    </div>
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>
          </div>
        ) : (
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:T.bg}}>
            <EmptyState icon="✨" title="Sélectionner une conversation" subtitle="Cliquez sur une conversation pour la lire." />
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
