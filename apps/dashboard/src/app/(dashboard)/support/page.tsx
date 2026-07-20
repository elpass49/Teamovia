/**
 * /support — Dashboard Lina, Agent Support
 */
'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import DashboardShell, { T, AgentHeader, Btn, EmptyState, Input, Badge } from '@/components/dashboard-shell'

const AGENT = { label: 'Lina', emoji: '💬', name: 'Lina', role: 'Agent Support', color: '#1E3A8A', tags: ['Tickets', 'Résolution', 'Satisfaction'] }

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

type Session = { id: string; user_ref: string|null; channel: string; status: string; updated_at: string }
type Message = { id: string; role: string; content: string; tokens_used: number|null; latency_ms: number|null; created_at: string }

const STATUS_COLOR: Record<string,string> = { open:'#1E3A8A', resolved:'#16A34A', escalated:'#DC2626', transferred:'#D97706' }
const STATUS_LABEL: Record<string,string> = { open:'Ouverte', resolved:'Résolue', escalated:'Escaladée', transferred:'Transférée' }

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60000) return "À l'instant"
  if (d < 3600000) return `${Math.floor(d/60000)}m`
  if (d < 86400000) return `${Math.floor(d/3600000)}h`
  return new Date(iso).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})
}

export default function SupportPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [active,   setActive]   = useState<Session|null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [filter,   setFilter]   = useState('all')
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [updating, setUpdating] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb().from('sessions').select('*').order('updated_at',{ascending:false})
    if (filter !== 'all') q = q.eq('status', filter)
    const { data } = await q
    setSessions((data??[]) as Session[])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!active) { setMessages([]); return }
    sb().from('messages').select('*').eq('session_id',active.id).order('created_at',{ascending:true})
      .then(({data}) => setMessages((data??[]) as Message[]))
  }, [active])

  useEffect(() => { endRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  useEffect(() => {
    if (!active) return
    const ch = sb().channel(`msg:${active.id}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`session_id=eq.${active.id}`},
        p => setMessages(prev => [...prev, p.new as Message]))
      .subscribe()
    return () => { sb().removeChannel(ch) }
  }, [active])

  async function updateStatus(status: string) {
    if (!active || updating) return
    setUpdating(true)
    await sb().from('sessions').update({status}).eq('id',active.id)
    setSessions(prev => prev.map(s => s.id === active.id ? {...s,status} : s))
    setActive(prev => prev ? {...prev,status} : null)
    setUpdating(false)
  }

  const displayed = sessions.filter(s => !search || (s.user_ref??'').toLowerCase().includes(search.toLowerCase()))
  const openCount = sessions.filter(s => s.status==='open').length

  return (
    <DashboardShell>
      <AgentHeader {...AGENT} stat={openCount} statLabel="ouvertes" />
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {/* Liste */}
        <div style={{width:'276px',flexShrink:0,borderRight:`1px solid ${T.border}`,display:'flex',flexDirection:'column',background:T.bg}}>
          <div style={{padding:'10px 12px',borderBottom:`1px solid ${T.border}`,display:'flex',flexDirection:'column',gap:'8px'}}>
            <Input value={search} onChange={setSearch} placeholder="Rechercher..." />
            <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
              {['all','open','escalated','resolved'].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding:'3px 10px',borderRadius:T.radiusFull,border:'none',cursor:'pointer',
                  fontSize:'11px',fontWeight:600,transition:'200ms',
                  background: filter===f ? AGENT.color : T.surfaceAlt,
                  color: filter===f ? '#fff' : T.textSecond,
                }}>
                  {f==='all'?'Toutes':STATUS_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {loading ? <div style={{padding:'24px',textAlign:'center',color:T.textSecond,fontSize:'13px'}}>Chargement...</div>
              : displayed.length===0 ? <EmptyState icon="💬" title="Aucune session" />
              : displayed.map(s => (
                <button key={s.id} onClick={() => setActive(s)} style={{
                  width:'100%',textAlign:'left',padding:'11px 14px',
                  background: active?.id===s.id ? `${AGENT.color}08` : 'transparent',
                  borderLeft: active?.id===s.id ? `3px solid ${AGENT.color}` : '3px solid transparent',
                  border:'none',borderBottom:`1px solid ${T.border}`,cursor:'pointer',transition:'200ms',
                }}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'13px',fontWeight:600,color:T.textPrimary}}>{s.user_ref??'Visiteur anonyme'}</span>
                    <span style={{fontSize:'10px',color:T.textSecond,fontFamily:'monospace'}}>{timeAgo(s.updated_at)}</span>
                  </div>
                  <div style={{marginTop:'4px'}}><Badge label={STATUS_LABEL[s.status]??s.status} color={STATUS_COLOR[s.status]} /></div>
                </button>
              ))}
          </div>
        </div>

        {/* Conversation */}
        {active ? (
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'12px 20px',background:T.surface,borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
              <div>
                <div style={{fontSize:'14px',fontWeight:600,color:T.textPrimary}}>{active.user_ref??'Visiteur anonyme'}</div>
                <div style={{fontSize:'11px',color:T.textSecond,marginTop:'2px',fontFamily:'monospace'}}>{active.channel} · {active.id.slice(0,8)}...</div>
              </div>
              <div style={{display:'flex',gap:'6px'}}>
                {active.status==='open' && <>
                  <Btn variant="primary" size="sm" onClick={() => updateStatus('resolved')} loading={updating}>✓ Résoudre</Btn>
                  <Btn variant="danger" size="sm" onClick={() => updateStatus('escalated')} loading={updating}>↑ Escalader</Btn>
                </>}
                {active.status!=='open' && <Badge label={STATUS_LABEL[active.status]??active.status} color={STATUS_COLOR[active.status]} />}
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'20px',display:'flex',flexDirection:'column',gap:'10px',background:T.bg}}>
              {messages.map(m => {
                if (m.role==='system') return (
                  <div key={m.id} style={{alignSelf:'center',fontSize:'11px',color:T.textSecond,background:T.surface,padding:'3px 12px',borderRadius:T.radiusFull,border:`1px solid ${T.border}`}}>
                    {m.content}
                  </div>
                )
                const isUser = m.role==='user'
                return (
                  <div key={m.id} style={{display:'flex',flexDirection:'column',maxWidth:'78%',gap:'3px',alignSelf:isUser?'flex-end':'flex-start',alignItems:isUser?'flex-end':'flex-start'}}>
                    <div style={{
                      padding:'10px 14px',
                      borderRadius: isUser ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                      background: isUser ? T.surfaceAlt : T.primary,
                      color: isUser ? T.textPrimary : '#fff',
                      fontSize:'13.5px',lineHeight:'1.55',whiteSpace:'pre-wrap',wordBreak:'break-word',
                    }}>{m.content}</div>
                    <div style={{fontSize:'10px',color:T.textSecond,fontFamily:'monospace',display:'flex',gap:'8px'}}>
                      <span>{new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
                      {m.tokens_used!=null&&<span>{m.tokens_used} tokens</span>}
                      {m.latency_ms!=null&&<span>{m.latency_ms}ms</span>}
                    </div>
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>
          </div>
        ) : (
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:T.bg}}>
            <EmptyState icon="💬" title="Sélectionner une session" subtitle="Cliquez sur une session pour voir la conversation." />
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
