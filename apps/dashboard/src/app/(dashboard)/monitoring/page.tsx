'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import styles from './monitoring.module.css'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Period = 'day' | 'week' | 'month'

type WorkspaceMetrics = {
  period: string
  sessions_total: number
  sessions_resolved: number
  sessions_escalated: number
  leads_total: number
  leads_qualified: number
  avg_score: number
  avg_latency_ms: number
  tokens_used_total: number
  handoffs_total: number
}

type AgentLog = {
  id: string
  agent_id: string | null
  session_id: string | null
  event_type: string
  payload: Record<string, unknown>
  latency_ms: number | null
  tokens_used: number | null
  created_at: string
}

type ChartDataPoint = {
  name: string
  [key: string]: string | number
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const COLORS = ['#4f6ef7', '#3fb950', '#f85149', '#d29922', '#1f6feb', '#bc8ef7']

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('fr-FR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getEventTypeColor(eventType: string): string {
  const colors: Record<string, string> = {
    message_in: '#4f6ef7',
    message_out: '#3fb950',
    tool_call: '#d29922',
    handoff: '#f85149',
    escalation: '#f85149',
    crm_sync: '#1f6feb',
    error: '#f85149',
  }
  return colors[eventType] || '#8b949e'
}

// ─────────────────────────────────────────────────────────────
// Metric Card
// ─────────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  unit = '',
  subtext = '',
}: {
  title: string
  value: number | string
  unit?: string
  subtext?: string
}) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricTitle}>{title}</div>
      <div className={styles.metricValue}>
        {value}
        {unit && <span className={styles.metricUnit}>{unit}</span>}
      </div>
      {subtext && <div className={styles.metricSubtext}>{subtext}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const [period, setPeriod] = useState<Period>('week')
  const [metrics, setMetrics] = useState<WorkspaceMetrics | null>(null)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all')
  const [sessionTrendData, setSessionTrendData] = useState<ChartDataPoint[]>([])
  const [leadStatusData, setLeadStatusData] = useState<ChartDataPoint[]>([])
  const [eventTypeData, setEventTypeData] = useState<ChartDataPoint[]>([])

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // ── Récupérer les métriques ──────────────────────────────
  const fetchMetrics = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_workspace_metrics', {
        p_workspace_id: null,  // courant (via RLS)
        p_agent_id: null,
        p_period: period,
      })

      if (!error && data) {
        setMetrics(data as WorkspaceMetrics)
      }
    } catch (err) {
      console.error('Erreur métriques:', err)
    }
  }, [supabase, period])

  // ── Récupérer les logs ───────────────────────────────────
  const fetchLogs = useCallback(async () => {
    try {
      let query = supabase
        .from('agent_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (eventTypeFilter !== 'all') {
        query = query.eq('event_type', eventTypeFilter)
      }

      const { data, error } = await query

      if (!error && data) {
        setLogs(data as AgentLog[])

        // Compter les événements par type pour le PieChart
        const eventCounts: Record<string, number> = {}
        data.forEach(log => {
          eventCounts[log.event_type] = (eventCounts[log.event_type] || 0) + 1
        })

        const pieData = Object.entries(eventCounts).map(([name, value]) => ({
          name,
          value,
        }))

        setEventTypeData(pieData)
      }
    } catch (err) {
      console.error('Erreur logs:', err)
    }
  }, [supabase, eventTypeFilter])

  // ── Générer données de tendance (simulation 7j) ──────────
  const generateTrendData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('created_at')
        .order('created_at', { ascending: true })

      if (!error && data) {
        const trendMap: Record<string, number> = {}

        // Grouper par jour
        data.forEach(session => {
          const date = new Date(session.created_at as string)
          const dayKey = date.toLocaleDateString('fr-FR', {
            month: 'short',
            day: 'numeric',
          })
          trendMap[dayKey] = (trendMap[dayKey] || 0) + 1
        })

        const trendArray = Object.entries(trendMap).map(([name, count]) => ({
          name,
          sessions: count,
        }))

        setSessionTrendData(trendArray.slice(-7))  // 7 derniers jours
      }
    } catch (err) {
      console.error('Erreur tendance:', err)
    }
  }, [supabase])

  // ── Générer données leads par statut ─────────────────────
  const generateLeadStatusData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('status')

      if (!error && data) {
        const statusCounts: Record<string, number> = {
          new: 0,
          qualifying: 0,
          qualified: 0,
          transferred: 0,
          lost: 0,
        }

        data.forEach(lead => {
          if (lead.status in statusCounts) {
            statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1
          }
        })

        const statusData = Object.entries(statusCounts).map(([name, count]) => ({
          name,
          count,
        }))

        setLeadStatusData(statusData)
      }
    } catch (err) {
      console.error('Erreur statut leads:', err)
    }
  }, [supabase])

  // ── Charger données au montage ──────────────────────────
  useEffect(() => {
    fetchMetrics()
    fetchLogs()
    generateTrendData()
    generateLeadStatusData()
  }, [fetchMetrics, fetchLogs, generateTrendData, generateLeadStatusData])

  // ── Setup realtime agent_logs ──────────────────────────
  useEffect(() => {
    const subscription = supabase
      .channel('agent_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_logs' },
        () => {
          fetchLogs()
          fetchMetrics()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchLogs, fetchMetrics, supabase])

  // ── Récupérer list des event_types pour filtre ──────────
  const eventTypes = Array.from(new Set(logs.map(l => l.event_type))).sort()

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Monitoring</h1>
        <div className={styles.periodSelector}>
          <label className={styles.periodLabel}>Période :</label>
          <select
            className={styles.periodSelect}
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="day">Jour</option>
            <option value="week">Semaine</option>
            <option value="month">Mois</option>
          </select>
        </div>
      </div>

      {/* Metric Cards */}
      <div className={styles.metricsRow}>
        <MetricCard
          title="Sessions totales"
          value={metrics?.sessions_total ?? 0}
        />
        <MetricCard
          title="Sessions résolues"
          value={metrics?.sessions_resolved ?? 0}
        />
        <MetricCard
          title="Escalades"
          value={metrics?.sessions_escalated ?? 0}
        />
        <MetricCard
          title="Leads totaux"
          value={metrics?.leads_total ?? 0}
        />
        <MetricCard
          title="Leads qualifiés"
          value={metrics?.leads_qualified ?? 0}
        />
        <MetricCard
          title="Score moyen"
          value={metrics?.avg_score?.toFixed(1) ?? 'N/A'}
          unit="/100"
        />
        <MetricCard
          title="Tokens utilisés"
          value={(metrics?.tokens_used_total ?? 0).toLocaleString()}
        />
        <MetricCard
          title="Latence moyenne"
          value={metrics?.avg_latency_ms?.toFixed(0) ?? 'N/A'}
          unit="ms"
        />
      </div>

      {/* Charts */}
      <div className={styles.chartsRow}>
        {/* Line Chart : Sessions trend */}
        {sessionTrendData.length > 0 && (
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Sessions (7j)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={sessionTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                <XAxis dataKey="name" stroke="#8b949e" />
                <YAxis stroke="#8b949e" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                  }}
                  labelStyle={{ color: '#c9d1d9' }}
                />
                <Line
                  type="monotone"
                  dataKey="sessions"
                  stroke="#4f6ef7"
                  strokeWidth={2}
                  dot={{ fill: '#4f6ef7', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Bar Chart : Leads by status */}
        {leadStatusData.length > 0 && (
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Leads par statut</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={leadStatusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                <XAxis dataKey="name" stroke="#8b949e" />
                <YAxis stroke="#8b949e" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                  }}
                  labelStyle={{ color: '#c9d1d9' }}
                />
                <Bar dataKey="count" fill="#4f6ef7" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Pie Chart : Event type distribution */}
        {eventTypeData.length > 0 && (
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Événements par type</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={eventTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} (${value})`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {eventTypeData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getEventTypeColor(entry.name)}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                  }}
                  labelStyle={{ color: '#c9d1d9' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Recent Logs Table */}
      <div className={styles.logsSection}>
        <div className={styles.logsHeader}>
          <h3 className={styles.logsTitle}>Logs récents</h3>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Type :</label>
            <select
              className={styles.filterSelect}
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
            >
              <option value="all">Tous</option>
              {eventTypes.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.logsTable}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Agent</th>
                <th>Type</th>
                <th>Latence (ms)</th>
                <th>Tokens</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 20).map(log => (
                <tr key={log.id}>
                  <td>{formatDate(log.created_at)}</td>
                  <td className={styles.agentCell}>
                    {log.agent_id ? log.agent_id.slice(0, 8) : '—'}
                  </td>
                  <td>
                    <span className={styles.eventTypeBadge} style={{
                      backgroundColor: `${getEventTypeColor(log.event_type)}20`,
                      color: getEventTypeColor(log.event_type),
                    }}>
                      {log.event_type}
                    </span>
                  </td>
                  <td>{log.latency_ms ?? '—'}</td>
                  <td>{log.tokens_used ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {logs.length === 0 && (
            <div className={styles.emptyLogs}>Aucun log</div>
          )}
        </div>
      </div>
    </div>
  )
}
