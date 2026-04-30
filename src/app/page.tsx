import Link from 'next/link'
import {
  FileText, Briefcase, Wand2, Kanban, Sparkles, Bookmark,
  Check, X, Zap, ArrowRight, Clock, TrendingUp,
} from 'lucide-react'

// ── Data ──────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: FileText,
    title: 'AI Resume Parsing',
    description: 'Turn your resume into structured, searchable data instantly.',
    hero: false,
  },
  {
    icon: Briefcase,
    title: 'Smart Job Matching',
    description: 'See only relevant jobs ranked by your actual fit score.',
    hero: false,
  },
  {
    icon: Wand2,
    title: 'Resume Optimization',
    description: 'Customize your resume for every job in seconds — not hours.',
    hero: true,
    tag: '🔥 Most Powerful',
  },
  {
    icon: Kanban,
    title: 'Application Tracker',
    description: 'Track your applications from applied → interview → offer.',
    hero: false,
  },
  {
    icon: Sparkles,
    title: 'AI Insights',
    description: 'Know exactly what\'s missing and how to improve your chances.',
    hero: false,
  },
  {
    icon: Bookmark,
    title: 'Save & Organize Jobs',
    description: 'Bookmark jobs and manage everything in one place.',
    hero: false,
  },
]

const whyPoints = [
  { icon: FileText,    text: 'Apply with job-specific resumes' },
  { icon: TrendingUp,  text: 'Increase match score instantly' },
  { icon: Clock,       text: 'Save hours of manual effort' },
  { icon: Sparkles,    text: 'Get actionable AI suggestions' },
  { icon: Briefcase,   text: 'Discover jobs you actually qualify for' },
]

const comparison = [
  { feature: 'Job Matching',       free: true,  pro: true },
  { feature: 'Resume per Job',     free: false, pro: true },
  { feature: 'AI Insights',        free: false, pro: true },
  { feature: 'Match Score Boost',  free: false, pro: true },
]

const freeFeatures = [
  'Resume upload & management',
  'Job search & matching',
  'Application tracking',
  'Save & organize jobs',
]

const proFeatures = [
  'Customize your resume for every job',
  'Increase your job match score instantly',
  'Get AI insights to improve applications',
  'Discover more relevant job opportunities',
  'Faster AI processing',
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#040D21] text-white overflow-x-hidden">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#040D21]/80 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Briefcase className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[17px] tracking-tight">Find All Job</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-[13px] font-medium text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            Sign In
          </Link>
          <Link href="/signup">
            <button className="bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-semibold px-4 py-2 rounded-lg hover:scale-[1.02] active:scale-100 transition-all shadow-lg shadow-blue-500/20">
              Get Started Free
            </button>
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-24 px-6 text-center">
        {/* Glow layers */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-blue-600/[0.12] blur-[120px]" />
          <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-indigo-500/[0.08] blur-[80px]" />
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-400 text-[12px] font-semibold mb-7 tracking-wide">
          <Sparkles className="w-3 h-3" />
          Powered by Claude AI
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-[64px] font-black tracking-[-0.02em] max-w-3xl mx-auto leading-[1.08] mb-6">
          Land interviews faster with{' '}
          <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-300 bg-clip-text text-transparent">
            AI-powered resume + job matching
          </span>
        </h1>

        <p className="text-[17px] text-slate-400 max-w-xl mx-auto leading-relaxed mb-10">
          Upload your resume once. Get matched with the right jobs, customize your
          resume for each role, and track everything in one place.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-5">
          <Link href="/signup">
            <button className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-7 py-3.5 rounded-xl hover:scale-[1.02] active:scale-100 transition-all shadow-2xl shadow-blue-500/25 text-[15px]">
              Get Started Free <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
          <Link href="/signup">
            <button className="flex items-center justify-center gap-2 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-white font-semibold px-7 py-3.5 rounded-xl hover:scale-[1.02] active:scale-100 transition-all text-[15px]">
              Upload Resume
            </button>
          </Link>
        </div>
        <p className="text-[12px] text-slate-600">No credit card required · Free plan available</p>
      </section>

      {/* ── Value props ─────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-[42px] font-black tracking-tight mb-3">
            Stop guessing. Start getting shortlisted.
          </h2>
          <p className="text-slate-400 text-[15px] max-w-md mx-auto">
            Six tools that work together to put you ahead of every other applicant.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, title, description, hero, tag }) => (
            <div
              key={title}
              className={[
                'relative rounded-2xl p-6 border transition-all duration-300 hover:-translate-y-1',
                hero
                  ? 'bg-gradient-to-br from-amber-950/40 via-[#0A1628] to-[#0A1628] border-amber-500/40 shadow-2xl shadow-amber-500/10 lg:scale-[1.03]'
                  : 'bg-[#0A1628] border-[#1A2A40] hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5',
              ].join(' ')}
            >
              {tag && (
                <span className="absolute -top-3 left-5 px-3 py-1 rounded-full bg-amber-500 text-black text-[11px] font-black tracking-wide">
                  {tag}
                </span>
              )}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${hero ? 'bg-amber-500/15' : 'bg-blue-500/10'}`}>
                <Icon className={`w-5 h-5 ${hero ? 'text-amber-400' : 'text-blue-400'}`} />
              </div>
              <h3 className="font-bold text-[16px] text-white mb-2">{title}</h3>
              <p className="text-slate-400 text-[13px] leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why section ─────────────────────────────────────────────────────── */}
      <section className="relative px-6 py-20 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-blue-600/[0.07] blur-[100px]" />
        </div>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-[42px] font-black tracking-tight mb-3">
              Why users get more interviews
            </h2>
            <p className="text-slate-400 text-[15px]">
              Built for job seekers who want results, not just more applications.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {whyPoints.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-3 bg-[#0A1628] border border-[#1A2A40] rounded-xl px-4 py-3.5 hover:border-blue-500/30 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-green-400" />
                </div>
                <span className="text-[13px] text-slate-300 font-medium">{text}</span>
              </div>
            ))}
            {/* Filler CTA tile */}
            <Link href="/signup" className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-center gap-2 bg-blue-600/10 border border-blue-500/30 rounded-xl px-4 py-3.5 hover:bg-blue-600/20 transition-colors h-full min-h-[56px] cursor-pointer">
                <ArrowRight className="w-4 h-4 text-blue-400" />
                <span className="text-[13px] text-blue-400 font-semibold">Start for free today</span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-[42px] font-black tracking-tight mb-3">
            Simple pricing. Real results.
          </h2>
          <p className="text-slate-400 text-[15px]">
            Start free. Upgrade when you want better outcomes.
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto mb-10">

          {/* Free */}
          <div className="bg-[#0A1628] border border-[#1A2A40] rounded-2xl p-7 flex flex-col">
            <div className="mb-6">
              <p className="text-[12px] font-bold uppercase tracking-widest text-slate-500 mb-2">Free</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-5xl font-black">$0</span>
              </div>
              <p className="text-[13px] text-slate-500 mt-1">Everything you need to get started</p>
            </div>
            <ul className="space-y-3 flex-1 mb-8">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-center gap-3 text-[13px] text-slate-300">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup">
              <button className="w-full py-3 rounded-xl border border-[#1A2A40] hover:border-blue-500/40 text-[13px] font-semibold text-white hover:bg-blue-500/5 transition-all">
                Get Started Free
              </button>
            </Link>
          </div>

          {/* Pro */}
          <div className="relative bg-gradient-to-b from-[#0D1F40] to-[#0A1628] border border-blue-500/40 rounded-2xl p-7 shadow-2xl shadow-blue-500/10 flex flex-col">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-blue-600 text-white text-[12px] font-black tracking-wide whitespace-nowrap shadow-lg shadow-blue-500/30">
              🚀 Most Popular
            </div>
            <div className="mb-6">
              <p className="text-[12px] font-bold uppercase tracking-widest text-blue-400 mb-2">Pro</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-5xl font-black">$5</span>
                <span className="text-slate-400 text-[15px] mb-1.5">/month</span>
              </div>
              <p className="text-[13px] text-slate-400 mt-1">Get more interviews with AI-powered applications</p>
            </div>
            <ul className="space-y-3 flex-1 mb-8">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-center gap-3 text-[13px] text-slate-300">
                  <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup">
              <button className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-bold hover:scale-[1.01] active:scale-100 transition-all shadow-xl shadow-blue-500/20">
                Upgrade to Pro
              </button>
            </Link>
            <p className="text-center text-[11px] text-slate-600 mt-3">Cancel anytime · No lock-in</p>
          </div>
        </div>

        {/* Comparison table */}
        <div className="max-w-2xl mx-auto bg-[#0A1628] border border-[#1A2A40] rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1A2A40]">
                <th className="text-left px-6 py-4 text-[12px] font-bold uppercase tracking-widest text-slate-500">Feature</th>
                <th className="px-6 py-4 text-[12px] font-bold uppercase tracking-widest text-slate-500 text-center">Free</th>
                <th className="px-6 py-4 text-[12px] font-bold uppercase tracking-widest text-blue-400 text-center">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2A40]">
              {comparison.map(({ feature, free, pro }) => (
                <tr key={feature} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-3.5 text-[13px] text-slate-300">{feature}</td>
                  <td className="px-6 py-3.5 text-center">
                    {free
                      ? <Check className="w-4 h-4 text-green-400 mx-auto" />
                      : <X className="w-4 h-4 text-slate-700 mx-auto" />}
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    {pro
                      ? <Check className="w-4 h-4 text-blue-400 mx-auto" />
                      : <X className="w-4 h-4 text-slate-700 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <section className="relative px-6 py-28 text-center overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-blue-600/[0.12] blur-[100px]" />
        </div>
        <h2 className="text-3xl sm:text-4xl md:text-[52px] font-black tracking-tight mb-4 max-w-2xl mx-auto leading-tight">
          Ready to land your next job faster?
        </h2>
        <p className="text-slate-400 text-[17px] mb-10">
          Stop applying blindly. Start applying smart.
        </p>
        <Link href="/signup">
          <button className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-xl hover:scale-[1.02] active:scale-100 transition-all shadow-2xl shadow-blue-500/25 text-[16px]">
            Upload Resume &amp; Get Matches
            <ArrowRight className="w-5 h-5" />
          </button>
        </Link>
        <p className="mt-4 text-[12px] text-slate-600">Free to start · No credit card required</p>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05] px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-6xl mx-auto text-[13px] text-slate-600">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Briefcase className="w-3 h-3 text-white" />
          </div>
          <span className="font-semibold text-slate-500">Find All Job</span>
        </div>
        <span>© {new Date().getFullYear()} Find All Job · Built with <a href="https://bestin-e.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors underline underline-offset-2">bestin-e.com</a></span>
        <div className="flex gap-4">
          <Link href="/login" className="hover:text-slate-400 transition-colors">Sign In</Link>
          <Link href="/signup" className="hover:text-slate-400 transition-colors">Sign Up</Link>
        </div>
      </footer>

    </div>
  )
}
