/**
 * /milo — Dashboard Milo, Agent Contenu
 */
'use client'

import { useState } from 'react'
import DashboardShell, { T, AgentHeader, Btn, EmptyState, Badge } from '@/components/dashboard-shell'

const AGENT = { emoji: '✍️', name: 'Milo', role: 'Agent Contenu', color: '#D97706', tags: ['Rédaction', 'Campagnes', 'Social media'] }
const API_URL         = 'http://127.0.0.1:8000/v1'
const WORKSPACE_TOKEN = 'b5299bf5-ad3a-4072-966e-8d4f4e94396e'

const FORMATS = [
  { value:'post_linkedin',label:'LinkedIn',icon:'💼',desc:'150-300 mots' },
  { value:'post_instagram',label:'Instagram',icon:'📸',desc:'Hashtags inclus' },
  { value:'post_facebook',label:'Facebook',icon:'👥',desc:'50-150 mots' },
  { value:'email_client',label:'Email',icon:'✉️',desc:'Objet + corps' },
  { value:'article_blog',label:'Article',icon:'📝',desc:'400-800 mots' },
  { value:'description_produit',label:'Produit',icon:'🏷️',desc:'80-150 mots' },
  { value:'script_video',label:'Vidéo',icon:'🎬',desc:'Format parlé' },
  { value:'sms',label:'SMS',icon:'💬',desc:'160 car. max' },
]
const TONES = [
  {value:'professionnel',label:'Professionnel'},
  {value:'chaleureux',label:'Chaleureux'},
  {value:'expert',label:'Expert'},
  {value:'decontracte',label:'Décontracté'},
  {value:'persuasif',label:'Persuasif'},
]

export default function MiloPage() {
  const [format,   setFormat]   = useState('post_linkedin')
  const [tone,     setTone]     = useState('professionnel')
  const [prompt,   setPrompt]   = useState('')
  const [context,  setContext]  = useState('')
  const [variants, setVariants] = useState(1)
  const [loading,  setLoading]  = useState(false)
  const [results,  setResults]  = useState<string[]>([])
  const [activeV,  setActiveV]  = useState(0)
  const [copied,   setCopied]   = useState(false)
  const [error,    setError]    = useState('')
  const [meta,     setMeta]     = useState<{tokens:number;ms:number}|null>(null)

  async function generate() {
    if (!prompt.trim()) return
    setLoading(true); setError(''); setResults([]); setMeta(null)
    try {
      const res = await fetch(`${API_URL}/agents/milo/generate`,{
        method:'POST',
        headers:{'Content-Type':'application/json','x-workspace-token':WORKSPACE_TOKEN},
        body:JSON.stringify({prompt:prompt.trim(),format,tone,variants,context:context.trim()||undefined}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setResults(data.variants??[data.content])
      setActiveV(0)
      setMeta({tokens:data.tokens_used,ms:data.latency_ms})
    } catch(e:any) { setError(e.message) } finally { setLoading(false) }
  }

  async function copy() {
    await navigator.clipboard.writeText(results[activeV]??'')
    setCopied(true); setTimeout(()=>setCopied(false),2000)
  }

  const selFormat = FORMATS.find(f=>f.value===format)

  return (
    <DashboardShell>
      <AgentHeader {...AGENT} statLabel="générateur" />
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* Config */}
        <div style={{width:'300px',flexShrink:0,borderRight:`1px solid ${T.border}`,padding:'20px 16px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'18px',background:T.bg}}>
          {/* Format */}
          <div>
            <div style={{fontSize:'11px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'10px'}}>Format</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
              {FORMATS.map(f => (
                <button key={f.value} onClick={()=>setFormat(f.value)} style={{
                  padding:'8px 10px',borderRadius:T.radiusSm,cursor:'pointer',textAlign:'left',
                  border: format===f.value ? `1.5px solid ${AGENT.color}` : `1px solid ${T.border}`,
                  background: format===f.value ? `${AGENT.color}0A` : T.surface,
                  transition:'200ms',
                }}>
                  <div style={{fontSize:'14px'}}>{f.icon}</div>
                  <div style={{fontSize:'11px',fontWeight:600,color:format===f.value?AGENT.color:T.textPrimary,marginTop:'3px'}}>{f.label}</div>
                  <div style={{fontSize:'10px',color:T.textSecond}}>{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Ton */}
          <div>
            <div style={{fontSize:'11px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px'}}>Ton</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'5px'}}>
              {TONES.map(t => (
                <button key={t.value} onClick={()=>setTone(t.value)} style={{
                  padding:'4px 12px',borderRadius:T.radiusFull,border:'none',cursor:'pointer',
                  fontSize:'12px',fontWeight:600,transition:'200ms',
                  background: tone===t.value ? AGENT.color : T.surfaceAlt,
                  color: tone===t.value ? '#fff' : T.textSecond,
                }}>{t.label}</button>
              ))}
            </div>
          </div>

          {/* Variantes */}
          <div>
            <div style={{fontSize:'11px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px'}}>Variantes</div>
            <div style={{display:'flex',gap:'6px'}}>
              {[1,2,3].map(n => (
                <button key={n} onClick={()=>setVariants(n)} style={{
                  width:36,height:34,borderRadius:T.radiusSm,border:'none',cursor:'pointer',
                  fontSize:'14px',fontWeight:700,transition:'200ms',
                  background: variants===n ? AGENT.color : T.surfaceAlt,
                  color: variants===n ? '#fff' : T.textSecond,
                }}>{n}</button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <div style={{fontSize:'11px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px'}}>Demande *</div>
            <textarea value={prompt} onChange={e=>setPrompt(e.target.value)}
              placeholder={`Ex: Écris un ${selFormat?.label.toLowerCase()} sur notre offre de fenêtres`}
              rows={4} style={{
                width:'100%',background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,
                padding:'9px 12px',color:T.textPrimary,fontSize:'13px',lineHeight:'1.5',
                fontFamily:T.fontBody,resize:'vertical',outline:'none',boxSizing:'border-box',
              }} />
            <div style={{fontSize:'10px',color:T.textSecond,textAlign:'right',marginTop:'3px'}}>{prompt.length}/2000</div>
          </div>

          {/* Contexte */}
          <div>
            <div style={{fontSize:'11px',fontWeight:600,color:T.textSecond,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px'}}>Contexte <span style={{fontWeight:400}}>(optionnel)</span></div>
            <textarea value={context} onChange={e=>setContext(e.target.value)}
              placeholder="Promotion en cours, événement, cible particulière..."
              rows={2} style={{
                width:'100%',background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.radiusSm,
                padding:'8px 12px',color:T.textPrimary,fontSize:'12px',lineHeight:'1.5',
                fontFamily:T.fontBody,resize:'vertical',outline:'none',boxSizing:'border-box',
              }} />
          </div>

          {error && <div style={{padding:'10px 12px',background:'#FEE2E2',border:'1px solid #FECACA',borderRadius:T.radiusSm,fontSize:'12px',color:T.danger}}>{error}</div>}

          <Btn variant="accent" onClick={generate} loading={loading} disabled={!prompt.trim()}>
            ✨ Générer
          </Btn>
        </div>

        {/* Résultats */}
        <div style={{flex:1,padding:'24px',overflowY:'auto',background:T.bg}}>
          {results.length===0 && !loading ? (
            <EmptyState icon="✍️" title="Prêt à créer" subtitle="Configure le format et décris ce que Milo doit rédiger." />
          ) : loading ? (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:'12px',color:T.textSecond}}>
              <span style={{fontSize:'32px'}}>✍️</span>
              <span style={{fontSize:'14px'}}>Milo rédige...</span>
            </div>
          ) : (
            <>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <span style={{fontSize:'14px',fontWeight:600,color:AGENT.color}}>{selFormat?.icon} {selFormat?.label}</span>
                  {meta && <span style={{fontSize:'11px',color:T.textSecond,fontFamily:'monospace'}}>{meta.tokens} tokens · {meta.ms}ms</span>}
                </div>
                <div style={{display:'flex',gap:'6px'}}>
                  {results.length>1 && results.map((_,i) => (
                    <button key={i} onClick={()=>setActiveV(i)} style={{
                      padding:'3px 10px',borderRadius:T.radiusFull,border:'none',cursor:'pointer',
                      fontSize:'11px',fontWeight:600,
                      background: activeV===i ? AGENT.color : T.surfaceAlt,
                      color: activeV===i ? '#fff' : T.textSecond,
                    }}>V{i+1}</button>
                  ))}
                  <Btn variant="ghost" size="sm" onClick={copy}>{copied?'✓ Copié':'⎘ Copier'}</Btn>
                  <Btn variant="accent" size="sm" onClick={generate} loading={loading}>↺ Regénérer</Btn>
                </div>
              </div>
              <Card padding="24px">
                <div style={{fontSize:'14px',lineHeight:'1.7',color:T.textPrimary,whiteSpace:'pre-wrap',minHeight:'200px'}}>
                  {results[activeV]}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
