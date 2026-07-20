/**
 * /monitoring — Dashboard Monitoring global
 */
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import DashboardShell, { T, AgentHeader, Card, Badge } from '@/components/dashboard-shell'

const AGENT = { label: 'Monitoring', emoji: '📊', name: 'Monitoring', role: 'Supervision globale', color: '#5A6472', tags: ['Sessions', 'Leads', 'Latence', 'Tokens'] }

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

type Log = { id:string; event_type:string; payload:any; latency_ms:number|null; tokens_used:number|null; model_used:string|null; created_at:string }
type Period = '24h'|'7j'|'30j'

const PERIOD_HOURS: Record<Period,number> = { '24h':24, '7j':168, '30j':720 }
const PIE_COLORS = ['#1E3A8A','#D97706','#0891B2','#16A34A','#7C3AED','#DC2626']

function StatCard({ label, value, sub, color }: { label:string; value:string|number; sub?:string; color?:string }) {
  return (
    <Card padding="16px 18px">
      <div style={{fontSize:'11px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'8px'}}>{label}</div>
      <div style={{fontSize:'26px',fontWeight:700,fontFamily:T.fontHead,color:color??T.textPrimary}}>{value}</div>
      {sub && <div style={{fontSize:'11px',color:T.textSecond,marginTop:'4px'}}>{sub}</div>}
    </Card>
  )
}

export default function MonitoringPage() {
  const [logs,   setLogs]   = useState<Log[]>([])
  const [period, setPeriod] = useState<Period>('24h')
  const [loading,setLoading]= useState(true)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - PERIOD_HOURS[period]*3600*1000).toISOString()
    const { data } = await sb().from('agent_logs').select('*').gte('created_at',since).order('created_at',{ascending:false}).limit(200)
    setLogs((data??[]) as Log[])
    setLoading(false)
  }, [period])

  useEffect(() => { load() }, [load])

  const total       = logs.length
  const avgLatency  = logs.filter(l=>l.latency_ms).reduce((a,l)=>a+(l.latency_ms??0),0) / (logs.filter(l=>l.latency_ms).length||1)
  const totalTokens = logs.reduce((a,l)=>a+(l.tokens_used??0),0)
  const errors      = logs.filter(l=>l.event_type==='error').length

  const timeGroups: Record<string,number> = {}
  logs.forEach(l => {
    const d   = new Date(l.created_at)
    const key = period==='24h' ? `${d.getHours()}h` : d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})
    timeGroups[key] = (timeGroups[key]??0)+1
  })
  const timeData = Object.entries(timeGroups).map(([name,count])=>({name,count})).slice(-12)

  const eventGroups: Record<string,number> = {}
  logs.forEach(l => { eventGroups[l.event_type]=(eventGroups[l.event_type]??0)+1 })
  const eventData = Object.entries(eventGroups).map(([name,value])=>({name,value}))
  const eventTypes = [...new Set(logs.map(l=>l.event_type))]
  const displayed  = logs.filter(l => filter==='all'||l.event_type===filter)

  return (
    <DashboardShell>
      <AgentHeader {...AGENT} stat={total} statLabel={`événements (${period})`} action={
        <div style={{display:'flex',gap:'4px'}}>
          {(['24h','7j','30j'] as Period[]).map(p => (
            <button key={p} onClick={()=>setPeriod(p)} style={{
              padding:'5px 12px',borderRadius:T.radiusFull,border:'none',cursor:'pointer',
              fontSize:'12px',fontWeight:600,transition:'200ms',
              background: period===p ? AGENT.color : T.surfaceAlt,
              color: period===p ? '#fff' : T.textSecond,
            }}>{p}</button>
          ))}
        </div>
      } />

      <div style={{flex:1,overflowY:'auto',padding:'20px 24px',background:T.bg}}>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px',marginBottom:'20px'}}>
          <StatCard label="Événements"      value={total}                        color={AGENT.color} />
          <StatCard label="Latence moy."    value={`${Math.round(avgLatency)}ms`} color="#1E3A8A" />
          <StatCard label="Tokens utilisés" value={totalTokens.toLocaleString('fr-FR')} color="#D97706" />
          <StatCard label="Erreurs"         value={errors} sub={`${((errors/(total||1))*100).toFixed(1)}% du total`} color={errors>0?'#DC2626':'#16A34A'} />
        </div>

        {/* Graphiques */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'20px'}}>
          <Card padding="16px 18px">
            <div style={{fontSize:'12px',fontWeight:600,color:T.textSecond,marginBottom:'14px'}}>Activité dans le temps</div>
            {timeData.length>0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={timeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="name" tick={{fontSize:10,fill:T.textSecond}} />
                  <YAxis tick={{fontSize:10,fill:T.textSecond}} />
                  <Tooltip contentStyle={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,fontSize:'12px'}} />
                  <Line type="monotone" dataKey="count" stroke="#1E3A8A" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div style={{height:160,display:'flex',alignItems:'center',justifyContent:'center',color:T.textSecond,fontSize:'13px'}}>Aucune donnée</div>}
          </Card>

          <Card padding="16px 18px">
            <div style={{fontSize:'12px',fontWeight:600,color:T.textSecond,marginBottom:'14px'}}>Répartition par type</div>
            {eventData.length>0 ? (
              <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={eventData} cx={65} cy={65} innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                      {eventData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,fontSize:'12px'}} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                  {eventData.map((e,i) => (
                    <div key={e.name} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'12px'}}>
                      <span style={{width:8,height:8,borderRadius:'50%',background:PIE_COLORS[i%PIE_COLORS.length],flexShrink:0}} />
                      <span style={{color:T.textSecond}}>{e.name}</span>
                      <span style={{fontWeight:600,color:T.textPrimary,marginLeft:'auto'}}>{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div style={{height:140,display:'flex',alignItems:'center',justifyContent:'center',color:T.textSecond,fontSize:'13px'}}>Aucune donnée</div>}
          </Card>
        </div>

        {/* Logs table */}
        <Card padding="0">
          <div style={{padding:'14px 18px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontSize:'13px',fontWeight:600,color:T.textPrimary}}>Logs récents</div>
            <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
              <button onClick={()=>setFilter('all')} style={{padding:'3px 10px',borderRadius:T.radiusFull,border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,background:filter==='all'?AGENT.color:T.surfaceAlt,color:filter==='all'?'#fff':T.textSecond}}>Tous</button>
              {eventTypes.slice(0,4).map(et => (
                <button key={et} onClick={()=>setFilter(et)} style={{padding:'3px 10px',borderRadius:T.radiusFull,border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,background:filter===et?AGENT.color:T.surfaceAlt,color:filter===et?'#fff':T.textSecond}}>{et}</button>
              ))}
            </div>
          </div>
          {loading ? (
            <div style={{padding:'32px',textAlign:'center',color:T.textSecond,fontSize:'13px'}}>Chargement...</div>
          ) : displayed.length===0 ? (
            <div style={{padding:'32px',textAlign:'center',color:T.textSecond,fontSize:'13px'}}>Aucun log pour cette période</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                <thead>
                  <tr style={{background:T.surfaceAlt}}>
                    {['Date','Type','Latence','Tokens','Modèle'].map(h => (
                      <th key={h} style={{padding:'8px 14px',textAlign:'left',color:T.textSecond,fontWeight:600,fontSize:'11px',textTransform:'uppercase',letterSpacing:'.04em',borderBottom:`1px solid ${T.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.slice(0,30).map((log,i) => (
                    <tr key={log.id} style={{borderBottom:`1px solid ${T.border}`,background:i%2===0?T.surface:T.bg}}>
                      <td style={{padding:'8px 14px',color:T.textSecond,fontFamily:'monospace',fontSize:'11px'}}>
                        {new Date(log.created_at).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                      </td>
                      <td style={{padding:'8px 14px'}}><Badge label={log.event_type} /></td>
                      <td style={{padding:'8px 14px',color:log.latency_ms&&log.latency_ms>3000?'#DC2626':T.textPrimary,fontFamily:'monospace'}}>
                        {log.latency_ms?`${log.latency_ms}ms`:'—'}
                      </td>
                      <td style={{padding:'8px 14px',color:T.textPrimary,fontFamily:'monospace'}}>{log.tokens_used??'—'}</td>
                      <td style={{padding:'8px 14px',color:T.textSecond,fontSize:'11px',fontFamily:'monospace'}}>{log.model_used??'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardShell>
  )
}
