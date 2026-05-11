import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'
import { LogoMark } from '@/components/LogoMark'
import { getRegionPricing } from '@/lib/pricing'

export const metadata: Metadata = {
  title: 'Pricing — Free, Pro Lite & Pro Plus | FindAllJob',
  description: 'FindAllJob is free to start. Upgrade to Pro Lite or Pro Plus to unlock AI resume optimization, mock interviews, and more AI credits. No credit card required to begin.',
  alternates: { canonical: 'https://www.findalljob.com/pricing' },
  openGraph: {
    title: 'Pricing | FindAllJob',
    description: 'Free to start. Upgrade anytime. AI-powered job search tools.',
    url: 'https://www.findalljob.com/pricing',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing | FindAllJob',
    description: 'Free to start. Upgrade anytime. AI-powered job search tools.',
  },
}

const freeFeatures = [
  'Resume upload & management',
  'Job search & matching',
  'Application tracking',
  'View up to 15 AI-ranked matches/day',
  '5 one-time AI credits',
  '1 resume upload',
  '1 resume optimization preview/day',
]

const proLiteFeatures = [
  'Everything in Free',
  '40 AI credits per month',
  'Optimize resumes for specific jobs',
  'Build resumes with AI',
  'Practice AI mock interviews',
  'Get resume improvement suggestions',
  'AI bullet writing assistant',
  'Expand and refresh job matches',
  'AI follow-up messages',
  'Faster AI processing',
]

const proPlusFeatures = [
  'Everything in Pro Lite',
  '120 AI credits per month',
  'More resume optimizations',
  'More mock interview practice',
  'More AI resume writing help',
  'More job match expansion',
  'More follow-up message support',
]

const faqs = [
  { q: 'Is FindAllJob really free to start?', a: 'Yes. You can sign up, upload your resume, search for jobs, and view AI-ranked matches without entering a credit card. Free accounts receive 5 one-time AI credits to try the AI features.' },
  { q: 'What are AI credits?', a: 'AI credits are consumed when you use AI-powered features — resume optimization, mock interview sessions, AI resume builder, AI bullet writing, and follow-up message generation. Each action costs one or more credits depending on complexity.' },
  { q: 'Do unused credits roll over?', a: 'No. Pro Lite and Pro Plus credits reset monthly. Unused credits from the previous month do not carry over.' },
  { q: 'Can I cancel my subscription anytime?', a: 'Yes. You can cancel your Pro subscription at any time from your account settings. You retain Pro access until the end of your current billing period.' },
  { q: 'Is there a difference between Pro Lite and Pro Plus features?', a: 'Both plans unlock the same set of AI features. Pro Plus gives you 3× more AI credits per month (120 vs 40), which means you can run more resume optimizations, mock interview sessions, and AI assists within the month.' },
  { q: 'Is pricing different for India?', a: 'Yes. Indian users see pricing in INR (₹299/month for Pro Lite, ₹599/month for Pro Plus), automatically detected based on your location.' },
]

function NavBar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#040D21]/80 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
      <LogoMark href="/" size="sm" onDark />
      <div className="flex items-center gap-3">
        <Link href="/login" className="text-[13px] font-medium text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
          Log in
        </Link>
        <Link href="/signup">
          <button className="bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-semibold px-4 py-2 rounded-lg hover:scale-[1.02] active:scale-100 transition-all shadow-lg shadow-blue-500/20">
            Get Started Free
          </button>
        </Link>
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.05] px-6 py-10 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-slate-600">
        <LogoMark href="/" size="sm" onDark />
        <span>© {new Date().getFullYear()} FindAllJob · AI-powered job search platform · Developed by <a href="https://www.bestin-e.com/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors underline underline-offset-2">Bestine</a></span>
        <div className="flex gap-4">
          <Link href="/signup" className="hover:text-slate-400 transition-colors">Sign Up</Link>
          <Link href="/login" className="hover:text-slate-400 transition-colors">Log In</Link>
        </div>
      </div>
    </footer>
  )
}

export default async function PricingPage() {
  const hdrs = await headers()
  const host = (hdrs.get('host') ?? '').split(':')[0]
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  const countryCode = isLocal ? 'in' : (hdrs.get('x-vercel-ip-country') ?? '').toLowerCase()
  const region = getRegionPricing(countryCode)
  const { free, proLite, proPlus } = region.plans

  return (
    <div className="min-h-screen bg-[#040D21] text-white overflow-x-hidden">
      <NavBar />

      {/* Hero */}
      <section className="relative px-6 pt-20 pb-12 text-center max-w-4xl mx-auto">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-blue-600/[0.10] blur-[100px]" />
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-[52px] font-black tracking-tight leading-[1.1] mb-5">
          Simple pricing. Smarter job search.
        </h1>
        <p className="text-[17px] text-slate-400 max-w-2xl mx-auto leading-relaxed mb-4">
          Start free. Upgrade when you need more AI power.
        </p>
        <p className="text-[13px] text-slate-600">No credit card required to start.</p>
      </section>

      {/* Pricing cards */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid sm:grid-cols-3 gap-5">

          {/* Free */}
          <div className="bg-[#0A1628] border border-[#1A2A40] rounded-2xl p-6 flex flex-col">
            <p className="text-[13px] font-bold uppercase tracking-widest text-slate-500 mb-2">{free.label}</p>
            <p className="text-4xl font-black text-white mb-1">{free.displayPrice}</p>
            <p className="text-[13px] text-slate-500 mb-6">forever free</p>
            <p className="text-[13px] text-slate-400 mb-6">Great for exploring the platform and trying AI features.</p>
            <ul className="space-y-2.5 mb-8 flex-1">
              {freeFeatures.map(f => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-slate-300">
                  <Check className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup">
              <button className="w-full border border-[#2A3A50] text-slate-300 hover:text-white hover:border-slate-500 font-semibold py-3 rounded-xl transition-all text-[14px]">
                Start Free
              </button>
            </Link>
          </div>

          {/* Pro Lite */}
          <div className="bg-[#0A1628] border-2 border-blue-500/60 rounded-2xl p-6 flex flex-col relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-bold px-4 py-1 rounded-full uppercase tracking-wider">Most Popular</div>
            <p className="text-[13px] font-bold uppercase tracking-widest text-blue-400 mb-2">{proLite.label}</p>
            <p className="text-4xl font-black text-white mb-1">{proLite.displayPrice}</p>
            <p className="text-[13px] text-slate-500 mb-6">per month</p>
            <p className="text-[13px] text-slate-400 mb-6">For active job seekers who want to apply smarter every month.</p>
            <ul className="space-y-2.5 mb-8 flex-1">
              {proLiteFeatures.map(f => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-slate-300">
                  <Check className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup">
              <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all text-[14px] shadow-lg shadow-blue-500/20">
                Get Pro Lite
              </button>
            </Link>
          </div>

          {/* Pro Plus */}
          <div className="bg-[#0A1628] border border-[#1A2A40] rounded-2xl p-6 flex flex-col">
            <p className="text-[13px] font-bold uppercase tracking-widest text-slate-500 mb-2">{proPlus.label}</p>
            <p className="text-4xl font-black text-white mb-1">{proPlus.displayPrice}</p>
            <p className="text-[13px] text-slate-500 mb-6">per month</p>
            <p className="text-[13px] text-slate-400 mb-6">For power users applying to multiple roles simultaneously.</p>
            <ul className="space-y-2.5 mb-8 flex-1">
              {proPlusFeatures.map(f => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-slate-300">
                  <Check className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup">
              <button className="w-full border border-[#2A3A50] text-slate-300 hover:text-white hover:border-slate-500 font-semibold py-3 rounded-xl transition-all text-[14px]">
                Get Pro Plus
              </button>
            </Link>
          </div>
        </div>

        <p className="text-center text-[12px] text-slate-600 mt-6">
          AI credits reset monthly on Pro plans · Indian users see ₹ pricing automatically
        </p>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-14 border-t border-[#1A2A40]">
        <h2 className="text-2xl font-black tracking-tight mb-8 text-center">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map(({ q, a }) => (
            <details key={q} className="group bg-[#0A1628] border border-[#1A2A40] rounded-xl px-6 py-4 cursor-pointer">
              <summary className="flex items-center justify-between font-semibold text-[15px] text-white list-none">
                {q}
                <span className="text-slate-500 ml-4 group-open:rotate-180 transition-transform text-lg leading-none">›</span>
              </summary>
              <p className="mt-3 text-[14px] text-slate-400 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative px-6 py-20 text-center overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-blue-600/[0.10] blur-[100px]" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-4">Ready to apply smarter?</h2>
        <p className="text-slate-400 text-[15px] mb-8">Start free. No credit card required.</p>
        <Link href="/signup">
          <button className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-xl hover:scale-[1.02] active:scale-100 transition-all shadow-2xl shadow-blue-500/25 text-[16px]">
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </button>
        </Link>
      </section>

      <Footer />
    </div>
  )
}
