import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import { ShieldCheck, Users, FileText, Wand2, Crown } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileRow {
  user_id: string
  full_name: string
  email: string
  subscription_status: string
  role: string
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: number | string
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
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  // Gate: only admins may access this page
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: selfProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!isAdminUser(user.email, selfProfile?.role)) redirect('/matches')

  // Use service-role client to bypass RLS and read all users' data
  const admin = createAdminClient()

  const [profilesResult, resumesResult, optimizationsResult] = await Promise.all([
    admin.from('profiles').select('user_id, full_name, email, subscription_status, role, created_at').order('created_at', { ascending: false }),
    admin.from('resumes').select('user_id'),
    admin.from('optimized_resumes').select('user_id'),
  ])

  const profiles: ProfileRow[] = profilesResult.data ?? []
  const resumes   = resumesResult.data ?? []
  const optimizations = optimizationsResult.data ?? []

  // Build count maps
  const resumeCount = resumes.reduce<Record<string, number>>((acc, r) => {
    acc[r.user_id] = (acc[r.user_id] ?? 0) + 1
    return acc
  }, {})

  const optCount = optimizations.reduce<Record<string, number>>((acc, r) => {
    acc[r.user_id] = (acc[r.user_id] ?? 0) + 1
    return acc
  }, {})

  const totalPro = profiles.filter(p => p.subscription_status === 'pro').length

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-[22px] font-black text-[#0F172A] dark:text-[#F1F5F9] leading-tight">Admin Panel</h1>
          <p className="text-[13px] text-gray-400 dark:text-slate-500 mt-0.5">System overview — visible to admins only.</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Users}    label="Total users"         value={profiles.length}                 color="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" />
        <StatCard icon={Crown}    label="Pro subscribers"     value={totalPro}                        color="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" />
        <StatCard icon={FileText} label="Resumes uploaded"    value={resumes.length}                  color="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" />
        <StatCard icon={Wand2}    label="AI optimizations"    value={optimizations.length}            color="bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400" />
      </div>

      {/* Users table */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#F1F5F9] dark:border-[#334155]">
          <h2 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">All Users</h2>
          <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">{profiles.length} registered accounts</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#F1F5F9] dark:border-[#334155] text-left">
                {['Name', 'Email', 'Plan', 'Role', 'Resumes', 'Optimizations', 'Joined'].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p, i) => (
                <tr
                  key={p.user_id}
                  className={[
                    'border-b border-[#F8FAFC] dark:border-[#263549] last:border-0 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors',
                    p.role === 'admin' ? 'bg-purple-50/30 dark:bg-purple-900/10' : '',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 font-semibold text-[#0F172A] dark:text-[#F1F5F9] whitespace-nowrap">
                    {p.full_name || <span className="text-gray-300 dark:text-slate-600 font-normal">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">
                    {p.email}
                  </td>
                  <td className="px-4 py-3">
                    <span className={[
                      'px-2 py-0.5 rounded-full text-[11px] font-bold',
                      p.subscription_status === 'pro'
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700'
                        : 'bg-gray-100 dark:bg-[#263549] text-gray-500 dark:text-slate-400',
                    ].join(' ')}>
                      {p.subscription_status === 'pro' ? 'Pro' : 'Free'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={[
                      'px-2 py-0.5 rounded-full text-[11px] font-bold',
                      p.role === 'admin'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700'
                        : 'bg-[#F1F5F9] dark:bg-[#263549] text-gray-400 dark:text-slate-500',
                    ].join(' ')}>
                      {p.role === 'admin' ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    {resumeCount[p.user_id] ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    {optCount[p.user_id] ?? 0}
                  </td>
                  <td className="px-4 py-3 text-gray-400 dark:text-slate-500 whitespace-nowrap">
                    {formatDate(p.created_at)}
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-gray-400 dark:text-slate-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
