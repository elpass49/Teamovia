/**
 * /kb — Base de connaissances
 */
'use client'

import { useEffect, useState, useCallback } from 'react'
import DashboardShell, { T, AgentHeader, Btn, EmptyState, Card, Input, Badge } from '@/components/dashboard-shell'

// const AGENT = { emoji: '🧠', name: 'KB', role: 'Base de connaissances', color: '#7C3AED', tags: ['RAG', 'Vecteurs', 'Documents'] }
// AGENT config dans dashboard-shell.tsx
const API_URL         = 'http://127.0.0.1:8000/v1'
const WORKSPACE_TOKEN = 'b5299bf5-ad3a-4072-966e-8d4f4e94396e'

const AGENT_IDS: Record<string,string> = {
  support: '00000000-0000-0000-0000-000000000020',
  sales:   '00000000-0000-0000-0000-000000000021',
}
const AGENT_COLORS: Record<string,string> = { support:'#1E3A8A', sales:'#D97706', shared:'#7C3AED' }

type Chunk = { id:string; content:string; agent_id:string|null; source:string; source_ref:string|null; metadata:any; created_at:string; similarity?: number }
type AgentFilter = 'all'|'support'|'sales'|'shared'

function agentLabel(id: string|null): string {
  if (!id) return 'Partagé'
  if (id===AGENT_IDS.support) return 'Support'
  if (id===AGENT_IDS.sales)   return 'Sales'
  return 'Autre'
}
function agentColor(id: string|null): string {
  if (!id) return AGENT_COLORS.shared
  if (id===AGENT_IDS.support) return AGENT_COLORS.support
  if (id===AGENT_IDS.sales)   return AGENT_COLORS.sales
  return '#7C3AED'
}

const h = { 'Content-Type':'application/json', 'x-workspace-token': WORKSPACE_TOKEN }

export default function KBPage() {
  const [chunks,    setChunks]    = useState<Chunk[]>([])
  const [filter,    setFilter]    = useState<AgentFilter>('all')
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [adding,    setAdding]    = useState(false)
  const [deleting,  setDeleting]  = useState<string|null>(null)
  const [error,     setError]     = useState('')
  const [srQuery,   setSrQuery]   = useState('')
  const [srResults, setSrResults] = useState<Chunk[]|null>(null)
  const [searching, setSearching] = useState(false)
  const [formContent, setFormContent] = useState('')
  const [formAgent,   setFormAgent]   = useState<'support'|'sales'|'shared'>('support')
  const [formRef,     setFormRef]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/knowledge?per_page=50`, {headers:h})
      const data = await res.json()
      setChunks(data.chunks??[])
    } catch { setError('API hors ligne ?') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function addChunk() {
    if (!formContent.trim()) return
    setAdding(true); setError('')
    try {
      const res = await fetch(`${API_URL}/knowledge`,{
        method:'POST', headers:h,
        body:JSON.stringify({content:formContent.trim(),agent_id:AGENT_IDS[formAgent]??null,source:'manual',source_ref:formRef.trim()||undefined}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const chunk = await res.json()
      setChunks(prev => [chunk, ...prev])
      setFormContent(''); setFormRef(''); setShowForm(false)
    } catch(e:any) { setError(e.message) } finally { setAdding(false) }
  }

  async function deleteChunk(id: string) {
    setDeleting(id)
    await fetch(`${API_URL}/knowledge/${id}`,{method:'DELETE',headers:h})
    setChunks(prev => prev.filter(c => c.id!==id))
    setDeleting(null)
  }

  async function semanticSearch() {
    if (!srQuery.trim()) return
    setSearching(true); setSrResults(null)
    try {
      const res = await fetch(`${API_URL}/knowledge/search`,{method:'POST',headers:h,body:JSON.stringify({query:srQuery,limit:5})})
      const data = await res.json()
      setSrResults(data.results??[])
    } catch { } finally { setSearching(false) }
  }

  const displayed = (srResults ?? chunks).filter(c => {
    if (filter==='all') return true
    if (filter==='shared') return !c.agent_id
    return c.agent_id===AGENT_IDS[filter]
  })

  return (
    <DashboardShell>
      <AgentHeader label="KB" role="Base de connaissances" color="#7C3AED" tags={['RAG','Vecteurs','Documents']} image={null} stat={chunks.length} statLabel="chunks" action={
        <Btn variant="primary" onClick={()=>setShowForm(!showForm)}>+ Ajouter</Btn>
      } />
      <div style={{flex:1,overflowY:'auto',padding:'20px 24px',background:T.bg}}>

        {error && <div style={{padding:'10px 14px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:T.radiusSm,fontSize:'13px',color:T.danger,marginBottom:'16px'}}>{error}</div>}

        {/* Formulaire */}
        {showForm && (
          <Card padding="18px 20px" style={{marginBottom:'16px'}}>
            <div style={{fontSize:'14px',fontWeight:600,color:T.textPrimary,marginBottom:'14px'}}>Nouveau chunk</div>
            <div style={{display:'flex',gap:'6px',marginBottom:'12px'}}>
              {(['support','sales','shared'] as const).map(a => (
                <button key={a} onClick={()=>setFormAgent(a)} style={{
                  padding:'5px 14px',borderRadius:T.radiusFull,border:'none',cursor:'pointer',
                  fontSize:'12px',fontWeight:600,transition:'200ms',
                  background: formAgent===a ? AGENT_COLORS[a] : T.surfaceAlt,
                  color: formAgent===a ? '#fff' : T.textSecond,
                }}>{a==='shared'?'Partagé':a==='support'?'Support':'Sales'}</button>
              ))}
            </div>
            <textarea value={formContent} onChange={e=>setFormContent(e.target.value)}
              placeholder="Contenu du chunk — ce texte sera vectorisé et utilisé par le RAG..."
              rows={4} style={{width:'100%',background:T.surfaceAlt,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,padding:'10px 12px',color:T.textPrimary,fontSize:'13px',lineHeight:'1.5',fontFamily:T.fontBody,resize:'vertical',outline:'none',boxSizing:'border-box',marginBottom:'8px'}} />
            <Input value={formRef} onChange={setFormRef} placeholder="Référence source (optionnel) — ex: faq-delais" style={{marginBottom:'12px'}} />
            <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
              <Btn variant="ghost" size="sm" onClick={()=>{setShowForm(false);setFormContent('');setFormRef('')}}>Annuler</Btn>
              <Btn variant="primary" size="sm" onClick={addChunk} loading={adding} disabled={formContent.trim().length<10}>Ajouter</Btn>
            </div>
          </Card>
        )}

        {/* Recherche sémantique */}
        <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
          <Input value={srQuery} onChange={v=>{setSrQuery(v);if(!v)setSrResults(null)}}
            placeholder="Recherche sémantique..."
            style={{flex:1}} />
          <Btn variant="ghost" onClick={semanticSearch} loading={searching} disabled={!srQuery.trim()}>Rechercher</Btn>
          {srResults && <Btn variant="ghost" size="sm" onClick={()=>{setSrResults(null);setSrQuery('')}}>✕</Btn>}
        </div>

        {/* Filtres */}
        {!srResults && (
          <div style={{display:'flex',gap:'5px',marginBottom:'14px'}}>
            {(['all','support','sales','shared'] as AgentFilter[]).map(f => (
              <button key={f} onClick={()=>setFilter(f)} style={{
                padding:'4px 12px',borderRadius:T.radiusFull,border:'none',cursor:'pointer',
                fontSize:'12px',fontWeight:600,transition:'200ms',
                background: filter===f ? (f==='all'?T.primary:AGENT_COLORS[f]??T.primary) : T.surfaceAlt,
                color: filter===f ? '#fff' : T.textSecond,
              }}>
                {f==='all'?`Tous (${chunks.length})`:f==='shared'?'Partagé':f==='support'?'Support':'Sales'}
              </button>
            ))}
          </div>
        )}

        {/* Chunks */}
        {loading ? <div style={{padding:'32px',textAlign:'center',color:T.textSecond,fontSize:'13px'}}>Chargement...</div>
          : displayed.length===0 ? <EmptyState icon="🧠" title="Aucun chunk" subtitle="Ajoutez du contenu à la base de connaissances." />
          : <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {displayed.map(chunk => (
              <Card key={chunk.id} padding="14px 16px" style={{borderLeft:`3px solid ${agentColor(chunk.agent_id)}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}}>
                    <Badge label={agentLabel(chunk.agent_id)} color={agentColor(chunk.agent_id)} />
                    {chunk.source_ref && <Badge label={chunk.source_ref} />}
                    {chunk.similarity!=null && <Badge label={`${Math.round(chunk.similarity*100)}% similaire`} color={T.success} />}
                  </div>
                  <button onClick={()=>deleteChunk(chunk.id)} disabled={deleting===chunk.id} style={{background:'none',border:'none',cursor:'pointer',color:T.textSecond,fontSize:'16px',opacity:deleting===chunk.id?.4:1}}>×</button>
                </div>
                <p style={{fontSize:'13px',lineHeight:'1.6',color:T.textPrimary,whiteSpace:'pre-wrap'}}>{chunk.content}</p>
                <div style={{fontSize:'10px',color:T.textSecond,marginTop:'8px',fontFamily:'monospace'}}>
                  {new Date(chunk.created_at).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})} · {chunk.id.slice(0,8)}...
                </div>
              </Card>
            ))}
          </div>
        }
      </div>
    </DashboardShell>
  )
}
