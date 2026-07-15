/**
 * /milo — Interface de génération de contenu
 */

'use client'

import { useState } from 'react'

const API_URL         = 'http://127.0.0.1:8000/v1'
const WORKSPACE_TOKEN = 'b5299bf5-ad3a-4072-966e-8d4f4e94396e'

type ContentFormat =
  | 'post_linkedin' | 'post_instagram' | 'post_facebook'
  | 'email_client'  | 'article_blog'   | 'description_produit'
  | 'script_video'  | 'sms'

type ContentTone = 'professionnel' | 'chaleureux' | 'expert' | 'decontracte' | 'persuasif'

const FORMATS: { value: ContentFormat; label: string; icon: string; desc: string }[] = [
  { value: 'post_linkedin',       label: 'LinkedIn',          icon: '💼', desc: '150-300 mots' },
  { value: 'post_instagram',      label: 'Instagram',         icon: '📸', desc: '50-150 mots + hashtags' },
  { value: 'post_facebook',       label: 'Facebook',          icon: '👥', desc: '50-150 mots' },
  { value: 'email_client',        label: 'Email client',      icon: '✉️',  desc: 'Objet + corps + signature' },
  { value: 'article_blog',        label: 'Article blog',      icon: '📝', desc: '400-800 mots' },
  { value: 'description_produit', label: 'Description',       icon: '🏷️', desc: '80-150 mots' },
  { value: 'script_video',        label: 'Script vidéo',      icon: '🎬', desc: 'Format parlé' },
  { value: 'sms',                 label: 'SMS',               icon: '💬', desc: 'Max 160 caractères' },
]

const TONES: { value: ContentTone; label: string }[] = [
  { value: 'professionnel', label: 'Professionnel' },
  { value: 'chaleureux',    label: 'Chaleureux' },
  { value: 'expert',        label: 'Expert' },
  { value: 'decontracte',   label: 'Décontracté' },
  { value: 'persuasif',     label: 'Persuasif' },
]

export default function MiloPage() {
  const [format,    setFormat]    = useState<ContentFormat>('post_linkedin')
  const [tone,      setTone]      = useState<ContentTone>('professionnel')
  const [prompt,    setPrompt]    = useState('')
  const [context,   setContext]   = useState('')
  const [variants,  setVariants]  = useState(1)
  const [loading,   setLoading]   = useState(false)
  const [results,   setResults]   = useState<string[]>([])
  const [activeVar, setActiveVar] = useState(0)
  const [copied,    setCopied]    = useState(false)
  const [error,     setError]     = useState('')
  const [meta,      setMeta]      = useState<{ tokens: number; ms: number } | null>(null)

  async function generate() {
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    setResults([])
    setMeta(null)

    try {
      const res = await fetch(`${API_URL}/agents/milo/generate`, {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-workspace-token': WORKSPACE_TOKEN,
        },
        body: JSON.stringify({
          prompt:   prompt.trim(),
          format,
          tone,
          variants,
          context:  context.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      setResults(data.variants ?? [data.content])
      setActiveVar(0)
      setMeta({ tokens: data.tokens_used, ms: data.latency_ms })
    } catch (err: any) {
      setError(err.message ?? 'Erreur lors de la génération')
    } finally {
      setLoading(false)
    }
  }

  async function copyToClipboard() {
    const text = results[activeVar]
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectedFormat = FORMATS.find(f => f.value === format)

  return (
    <div style={{
      minHeight: '100vh', background: '#0F1117',
      color: '#E8EAEE', fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 32px 20px',
        borderBottom: '1px solid #2A3048',
        background: '#181C27',
        display: 'flex', alignItems: 'center', gap: '14px',
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: 'linear-gradient(135deg, #F39C12, #E67E22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '20px',
        }}>✍️</div>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700 }}>Milo — Agent Contenu</h1>
          <p style={{ fontSize: '12px', color: '#7A839A', marginTop: '2px' }}>
            Génère du contenu professionnel à la demande
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Panneau gauche — configuration */}
        <div style={{
          width: '340px', flexShrink: 0,
          borderRight: '1px solid #2A3048',
          padding: '24px 20px',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '20px',
        }}>

          {/* Format */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#7A839A', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: '10px' }}>
              Format
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {FORMATS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  style={{
                    padding: '8px 10px', borderRadius: '8px',
                    border: format === f.value ? '1px solid #F39C12' : '1px solid #2A3048',
                    cursor: 'pointer', textAlign: 'left',
                    background: format === f.value ? 'rgba(243,156,18,.1)' : '#181C27',
                    transition: 'all 150ms',
                  }}
                >
                  <div style={{ fontSize: '14px' }}>{f.icon}</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: format === f.value ? '#F39C12' : '#E8EAEE', marginTop: '3px' }}>{f.label}</div>
                  <div style={{ fontSize: '10px', color: '#454D66', marginTop: '1px' }}>{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Ton */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#7A839A', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: '8px' }}>
              Ton
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {TONES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTone(t.value)}
                  style={{
                    padding: '5px 12px', borderRadius: '20px', border: 'none',
                    cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                    background: tone === t.value ? '#F39C12' : '#1E2336',
                    color: tone === t.value ? '#0F1117' : '#7A839A',
                    transition: 'all 150ms',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Variantes */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#7A839A', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: '8px' }}>
              Nombre de variantes
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  onClick={() => setVariants(n)}
                  style={{
                    width: '40px', height: '36px', borderRadius: '8px', border: 'none',
                    cursor: 'pointer', fontSize: '14px', fontWeight: 700,
                    background: variants === n ? '#F39C12' : '#1E2336',
                    color: variants === n ? '#0F1117' : '#7A839A',
                    transition: 'all 150ms',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#7A839A', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: '8px' }}>
              Demande *
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={`Ex: Écris un ${selectedFormat?.label.toLowerCase()} sur notre nouvelle gamme de fenêtres aluminium`}
              rows={4}
              style={{
                width: '100%', background: '#1E2336',
                border: '1px solid #2A3048', borderRadius: '8px',
                padding: '10px 12px', color: '#E8EAEE',
                fontSize: '13px', lineHeight: '1.5',
                fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: '10px', color: '#454D66', textAlign: 'right', marginTop: '4px' }}>
              {prompt.length} / 2000
            </div>
          </div>

          {/* Contexte optionnel */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#7A839A', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: '8px' }}>
              Contexte supplémentaire (optionnel)
            </label>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Infos spécifiques : promotion en cours, événement, cible particulière..."
              rows={2}
              style={{
                width: '100%', background: '#1E2336',
                border: '1px solid #2A3048', borderRadius: '8px',
                padding: '8px 12px', color: '#E8EAEE',
                fontSize: '12px', lineHeight: '1.5',
                fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Bouton générer */}
          <button
            onClick={generate}
            disabled={loading || !prompt.trim()}
            style={{
              width: '100%', padding: '12px',
              borderRadius: '10px', border: 'none',
              cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 700,
              background: 'linear-gradient(135deg, #F39C12, #E67E22)',
              color: '#0F1117',
              opacity: loading || !prompt.trim() ? .5 : 1,
              transition: 'opacity 150ms',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {loading ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                Génération en cours...
              </>
            ) : (
              <>✨ Générer</>
            )}
          </button>

          {error && (
            <div style={{
              padding: '10px 14px', background: 'rgba(231,76,60,.1)',
              border: '1px solid rgba(231,76,60,.3)', borderRadius: '8px',
              fontSize: '12px', color: '#E74C3C',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Panneau droit — résultats */}
        <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
          {results.length === 0 && !loading ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '12px',
              color: '#454D66',
            }}>
              <div style={{ fontSize: '48px' }}>✍️</div>
              <p style={{ fontSize: '14px' }}>Configure et génère ton contenu</p>
              <p style={{ fontSize: '12px', color: '#2A3048' }}>
                Milo utilisera la KB de ton workspace pour personnaliser le contenu
              </p>
            </div>
          ) : loading ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '12px',
              color: '#7A839A',
            }}>
              <div style={{ fontSize: '32px', animation: 'pulse 1.5s ease-in-out infinite' }}>✨</div>
              <p style={{ fontSize: '14px' }}>Milo rédige votre contenu...</p>
            </div>
          ) : (
            <>
              {/* Header résultats */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#F39C12' }}>
                    {selectedFormat?.icon} {selectedFormat?.label}
                  </span>
                  {meta && (
                    <span style={{ fontSize: '11px', color: '#454D66', fontFamily: 'monospace' }}>
                      {meta.tokens} tokens · {meta.ms}ms
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {/* Sélecteur variantes */}
                  {results.length > 1 && results.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveVar(i)}
                      style={{
                        padding: '4px 12px', borderRadius: '20px', border: 'none',
                        cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                        background: activeVar === i ? '#F39C12' : '#1E2336',
                        color: activeVar === i ? '#0F1117' : '#7A839A',
                      }}
                    >
                      V{i + 1}
                    </button>
                  ))}

                  {/* Copier */}
                  <button
                    onClick={copyToClipboard}
                    style={{
                      padding: '6px 14px', borderRadius: '8px',
                      border: '1px solid #2A3048', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 600,
                      background: copied ? 'rgba(46,204,113,.15)' : '#1E2336',
                      color: copied ? '#2ECC71' : '#7A839A',
                      transition: 'all 200ms',
                    }}
                  >
                    {copied ? '✓ Copié !' : '⎘ Copier'}
                  </button>

                  {/* Régénérer */}
                  <button
                    onClick={generate}
                    disabled={loading}
                    style={{
                      padding: '6px 14px', borderRadius: '8px',
                      border: 'none', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 600,
                      background: '#F39C12', color: '#0F1117',
                    }}
                  >
                    ↺ Régénérer
                  </button>
                </div>
              </div>

              {/* Contenu généré */}
              <div style={{
                background: '#181C27',
                border: '1px solid #2A3048',
                borderRadius: '12px',
                padding: '24px',
                fontSize: '14px',
                lineHeight: '1.7',
                color: '#C8CDD8',
                whiteSpace: 'pre-wrap',
                minHeight: '300px',
              }}>
                {results[activeVar]}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
      `}</style>
    </div>
  )
}
