import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import { DollarSign, Zap, TrendingUp, Users, ArrowLeft } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsageEvent {
  id: string
  user_id: string | null
  feature: string
  model_tier: string
  model_name: string
  input_tokens: number
  output_tokens: number
  cost_usd: string
  is_free_user: boolean
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCost(n: number): string {
  if (n === 0) return '$0.00'
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(6)}`
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-none">{value}</p>
        <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-gray-300 dark:text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: selfProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!isAdminUser(user.email, selfProfile?.role)) redirect('/matches')

  const admin = createAdminClient()
  const params = await searchParams
  const days = Math.max(1, Math.min(90, Number(params?.days ?? 30) || 30))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // ── Fetch events in range ────────────────────────────────────────────────────
  const { data: rawEvents } = await admin
    .from('ai_usage_events')
    .select('id, user_id, feature, model_tier, model_name, input_tokens, output_tokens, cost_usd, is_free_user, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  const evts: UsageEvent[] = rawEvents ?? []

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalCost = evts.reduce((s, e) => s + Number(e.cost_usd), 0)
  const freeCost  = evts.filter(e => e.is_free_user).reduce((s, e) => s + Number(e.cost_usd), 0)
  const paidCost  = totalCost - freeCost
  const totalReqs = evts.length
  const freePct   = totalCost > 0 ? (freeCost / totalCost) * 100 : 0

  // ── Feature breakdown ────────────────────────────────────────────────────
  const featureMap = new Map<string, { requests: number; totalCost: number; freeCost: number }>()
  for (const e of evts) {
    const f = featureMap.get(e.feature) ?? { requests: 0, totalCost: 0, freeCost: 0 }
    f.requests++
    f.totalCost += Number(e.cost_usd)
    if (e.is_free_user) f.freeCost += Number(e.cost_usd)
    featureMap.set(e.feature, f)
  }
  const features = Array.from(featureMap.entries())
    .map(([feature, s]) => ({
      feature,
      requests:  s.requests,
      totalCost: s.totalCost,
      freeCost:  s.freeCost,
      avgCost:   s.totalCost / s.requests,
      freePct:   s.totalCost > 0 ? (s.freeCost / s.totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)

  // ── Heavy users ──────────────────────────────────────────────────────────
  const userMap = new Map<string, { requests: number; totalCost: number }>()
  for (const e of evts) {
    if (!e.user_id) continue
    const u = userMap.get(e.user_id) ?? { requests: 0, totalCost: 0 }
    u.requests++
    u.totalCost += Number(e.cost_usd)
    userMap.set(e.user_id, u)
  }
  const topUserIds = Array.from(userMap.entries())
    .sort(([, a], [, b]) => b.totalCost - a.totalCost)
    .slice(0, 15)
    .map(([uid]) => uid)

  const { data: profilesData } = topUserIds.length > 0
    ? await admin
        .from('profiles')
        .select('user_id, email, full_name, subscription_status')
        .in('user_id', topUserIds)
    : { data: [] }

  const profileLookup = new Map((profilesData ?? []).map(p => [p.user_id, p]))
  const heavyUsers = topUserIds.map(uid => {
    const stats   = userMap.get(uid)!
    const profile = profileLookup.get(uid)
    return {
      uid,
      email: profile?.email ?? `${uid.slice(0, 8)}…`,
      name:  profile?.full_name ?? '',
      plan:  profile?.subscription_status ?? 'unknown',
      requests:  stats.requests,
      totalCost: stats.totalCost,
    }
  })

  // ── Daily trend (last 14 days, regardless of `days` filter) ──────────────
  const dailyMap = new Map<string, { cost: number; freeCost: number }>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    dailyMap.set(d, { cost: 0, freeCost: 0 })
  }
  for (const e of evts) {
    const d = e.created_at.slice(0, 10)
    const entry = dailyMap.get(d)
    if (!entry) continue
    entry.cost += Number(e.cost_usd)
    if (e.is_free_user) entry.freeCost += Number(e.cost_usd)
  }
  const dailyTrend = Array.from(dailyMap.entries()).map(([date, s]) => ({ date, ...s }))
  const maxDailyCost = Math.max(...dailyTrend.map(d => d.cost), 0.0001)

  // ── Conversion: free optimize_job previews → Pro ─────────────────────────
  const freeOptimizers = new Set<string>()
  for (const e of evts) {
    if (e.is_free_user && e.feature === 'resume_optimize_job' && e.user_id) {
      freeOptimizers.add(e.user_id)
    }
  }
  let convertedCount = 0
  if (freeOptimizers.size > 0) {
    const { data: converted } = await admin
      .from('profiles')
      .select('user_id')
      .in('user_id', Array.from(freeOptimizers))
      .eq('subscription_status', 'pro')
    convertedCount = converted?.length ?? 0
  }
  const conversionRate = freeOptimizers.size > 0 ? (convertedCount / freeOptimizers.size) * 100 : 0

  // ── Render ────────────────────────────────────────────────────────────────
  const DAYS_OPTIONS = [7, 30, 90]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="w-8 h-8 rounded-lg bg-[#F1F5F9] dark:bg-[#263549] flex items-center justify-center hover:bg-[#E2E8F0] dark:hover:bg-[#1E293B] transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-500 dark:text-slate-400" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-tight">AI Usage Dashboard</h1>
            <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">Cost per feature, per user, free vs paid.</p>
          </div>
        </div>

        {/* Date range selector */}
        <div className="flex items-center gap-1 bg-[#F1F5F9] dark:bg-[#263549] rounded-xl p-1">
          {DAYS_OPTIONS.map(d => (
            <Link
              key={d}
              href={`/admin/usage?days=${d}`}
              className={[
                'px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors',
                days === d
                  ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-[#F1F5F9]',
              ].join(' ')}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard icon={DollarSign}  label={`Total cost (${days}d)`}    value={fmtCost(totalCost)}  color="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" />
        <StatCard icon={TrendingUp}  label="Paid-user cost"             value={fmtCost(paidCost)}   color="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" />
        <StatCard icon={Users}       label="Free-user cost"             value={fmtCost(freeCost)}   sub={`${fmtPct(freePct)} of total`} color="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400" />
        <StatCard icon={Zap}         label="Total AI requests"          value={totalReqs.toLocaleString()} color="bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400" />
        <StatCard icon={TrendingUp}  label="Optimize preview → Pro"     value={freeOptimizers.size > 0 ? fmtPct(conversionRate) : '—'} sub={freeOptimizers.size > 0 ? `${convertedCount} of ${freeOptimizers.size} converted` : 'No preview data'} color="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" />
      </div>

      {/* Daily cost trend */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-5">
        <h2 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9] mb-1">Daily cost — last 14 days</h2>
        <p className="text-[12px] text-gray-400 dark:text-slate-500 mb-4">Blue = paid, red = free user cost stacked above.</p>
        <div className="flex items-end gap-1 h-28">
          {dailyTrend.map(({ date, cost, freeCost: fc }) => {
            const totalH = Math.round((cost / maxDailyCost) * 100)
            const freeH  = cost > 0 ? Math.round((fc / cost) * totalH) : 0
            const paidH  = totalH - freeH
            return (
              <div key={date} className="flex-1 flex flex-col items-center gap-0.5" title={`${fmtDate(date)}: ${fmtCost(cost)} (${fmtCost(fc)} free)`}>
                <div className="w-full flex flex-col justify-end" style={{ height: '96px' }}>
                  {freeH > 0 && (
                    <div className="w-full rounded-t-sm bg-rose-400 dark:bg-rose-500" style={{ height: `${freeH}%` }} />
                  )}
                  {paidH > 0 && (
                    <div className={`w-full bg-blue-400 dark:bg-blue-500 ${freeH === 0 ? 'rounded-t-sm' : ''}`} style={{ height: `${paidH}%` }} />
                  )}
                  {totalH === 0 && (
                    <div className="w-full bg-gray-100 dark:bg-[#263549]" style={{ height: '4px' }} />
                  )}
                </div>
                <span className="text-[9px] text-gray-300 dark:text-slate-600 leading-none">{fmtDate(date)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Feature breakdown table */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#F1F5F9] dark:border-[#334155]">
          <h2 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">Cost by feature</h2>
          <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">Which features are burning cost — and how much is free-user spend.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#F1F5F9] dark:border-[#334155] text-left">
                {['Feature', 'Requests', 'Total cost', 'Free cost', 'Avg / req', 'Free %'].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-gray-400 dark:text-slate-500">
                    No events recorded yet in this period.
                  </td>
                </tr>
              ) : features.map(f => (
                <tr key={f.feature} className="border-b border-[#F8FAFC] dark:border-[#263549] last:border-0 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors">
                  <td className="px-4 py-3 font-mono text-[12px] font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{f.feature}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-right">{f.requests.toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold text-[#0F172A] dark:text-[#F1F5F9] text-right">{fmtCost(f.totalCost)}</td>
                  <td className="px-4 py-3 text-rose-600 dark:text-rose-400 text-right">{fmtCost(f.freeCost)}</td>
                  <td className="px-4 py-3 text-gray-400 dark:text-slate-500 text-right">{fmtCost(f.avgCost)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={[
                      'px-2 py-0.5 rounded-full text-[11px] font-bold',
                      f.freePct >= 70 ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400' :
                      f.freePct >= 30 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' :
                                        'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
                    ].join(' ')}>
                      {fmtPct(f.freePct)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Heavy users table */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#F1F5F9] dark:border-[#334155]">
          <h2 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">Heavy users</h2>
          <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">Top 15 users by AI cost — sorted by spend.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#F1F5F9] dark:border-[#334155] text-left">
                {['#', 'Email', 'Plan', 'Requests', 'Total cost'].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heavyUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[13px] text-gray-400 dark:text-slate-500">
                    No user activity in this period.
                  </td>
                </tr>
              ) : heavyUsers.map((u, i) => (
                <tr key={u.uid} className="border-b border-[#F8FAFC] dark:border-[#263549] last:border-0 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors">
                  <td className="px-4 py-3 text-gray-300 dark:text-slate-600 font-bold w-8">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{u.email}</div>
                    {u.name && <div className="text-[11px] text-gray-400 dark:text-slate-500">{u.name}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={[
                      'px-2 py-0.5 rounded-full text-[11px] font-bold',
                      u.plan === 'pro'
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700'
                        : 'bg-gray-100 dark:bg-[#263549] text-gray-500 dark:text-slate-400',
                    ].join(' ')}>
                      {u.plan === 'pro' ? 'Pro' : 'Free'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-right">{u.requests.toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold text-[#0F172A] dark:text-[#F1F5F9] text-right">{fmtCost(u.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
