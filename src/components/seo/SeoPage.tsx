import Link from 'next/link'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { LogoMark } from '@/components/LogoMark'

export interface FaqItem {
  q: string
  a: string
}

export interface RelatedLink {
  label: string
  href: string
}

export interface SeoPageProps {
  /** H1 — shown large at top */
  headline: string
  /** Subtitle below H1 */
  subheadline: string
  /** Primary CTA button label */
  ctaLabel: string
  /** Primary CTA destination — defaults to /signup */
  ctaHref?: string
  /** Accent colour class for the CTA button bg */
  ctaColor?: string
  /** Body sections rendered between hero and FAQ */
  children: React.ReactNode
  faqs?: FaqItem[]
  relatedLinks?: RelatedLink[]
}

function NavBar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#040D21]/80 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
      <LogoMark href="/" size="sm" onDark />
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-[13px] font-medium text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
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

function Footer({ relatedLinks }: { relatedLinks?: RelatedLink[] }) {
  return (
    <footer className="border-t border-white/[0.05] px-6 py-10 max-w-5xl mx-auto">
      {relatedLinks && relatedLinks.length > 0 && (
        <div className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-3">Related</p>
          <div className="flex flex-wrap gap-3">
            {relatedLinks.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="text-[13px] text-slate-400 hover:text-blue-400 transition-colors hover:underline underline-offset-2"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-slate-600">
        <LogoMark href="/" size="sm" onDark />
        <span>© {new Date().getFullYear()} FindAllJob · AI-powered job search platform · Developed by <a href="https://www.bestin-e.com/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors underline underline-offset-2">Bestine</a></span>
        <div className="flex gap-4">
          <Link href="/signup" className="hover:text-slate-400 transition-colors">Sign Up</Link>
          <Link href="/login"  className="hover:text-slate-400 transition-colors">Log In</Link>
        </div>
      </div>
    </footer>
  )
}

export function SeoPage({
  headline,
  subheadline,
  ctaLabel,
  ctaHref = '/signup',
  children,
  faqs,
  relatedLinks,
}: SeoPageProps) {
  return (
    <div className="min-h-screen bg-[#040D21] text-white overflow-x-hidden">
      <NavBar />

      {/* Hero */}
      <section className="relative px-6 pt-20 pb-16 text-center max-w-4xl mx-auto">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-blue-600/[0.10] blur-[100px]" />
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-[52px] font-black tracking-tight leading-[1.1] mb-5">
          {headline}
        </h1>
        <p className="text-[17px] text-slate-400 max-w-2xl mx-auto leading-relaxed mb-8">
          {subheadline}
        </p>
        <Link href={ctaHref}>
          <button className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-xl hover:scale-[1.02] active:scale-100 transition-all shadow-2xl shadow-blue-500/25 text-[16px]">
            {ctaLabel}
            <ArrowRight className="w-5 h-5" />
          </button>
        </Link>
        <p className="mt-4 text-[12px] text-slate-600">Free to start · No credit card required</p>
      </section>

      {/* Body content */}
      <div className="max-w-4xl mx-auto px-6">
        {children}
      </div>

      {/* FAQ */}
      {faqs && faqs.length > 0 && (
        <section className="max-w-3xl mx-auto px-6 py-14">
          <h2 className="text-2xl font-black tracking-tight mb-8 text-center">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map(({ q, a }) => (
              <details key={q} className="group bg-[#0A1628] border border-[#1A2A40] rounded-xl px-6 py-4 cursor-pointer">
                <summary className="flex items-center justify-between font-semibold text-[15px] text-white list-none">
                  {q}
                  <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0 ml-4 group-open:rotate-180 transition-transform" />
                </summary>
                <p className="mt-3 text-[14px] text-slate-400 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="relative px-6 py-20 text-center overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-blue-600/[0.10] blur-[100px]" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-4">Ready to get started?</h2>
        <p className="text-slate-400 text-[15px] mb-8">Join thousands of job seekers applying smarter with AI.</p>
        <Link href={ctaHref}>
          <button className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-xl hover:scale-[1.02] active:scale-100 transition-all shadow-2xl shadow-blue-500/25 text-[16px]">
            {ctaLabel}
            <ArrowRight className="w-5 h-5" />
          </button>
        </Link>
        <p className="mt-4 text-[12px] text-slate-600">Free to start · No credit card required</p>
      </section>

      <Footer relatedLinks={relatedLinks} />
    </div>
  )
}

/** Reusable section heading */
export function SeoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-10 border-t border-[#1A2A40]">
      <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-6">{title}</h2>
      {children}
    </section>
  )
}

/** Three-column feature grid card */
export function FeatureGrid({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map(({ title, body }) => (
        <div key={title} className="bg-[#0A1628] border border-[#1A2A40] rounded-xl p-5">
          <p className="font-bold text-[14px] text-white mb-2">{title}</p>
          <p className="text-[13px] text-slate-400 leading-relaxed">{body}</p>
        </div>
      ))}
    </div>
  )
}

/** Simple two-column comparison */
export function CompareTable({ rows }: { rows: { label: string; without: string; with: string }[] }) {
  return (
    <div className="bg-[#0A1628] border border-[#1A2A40] rounded-xl overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[#1A2A40]">
            <th className="text-left px-5 py-3 text-slate-500 font-bold uppercase tracking-wider text-[11px]">Without FindAllJob</th>
            <th className="text-left px-5 py-3 text-blue-400 font-bold uppercase tracking-wider text-[11px]">With FindAllJob</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1A2A40]">
          {rows.map(({ without, with: withVal }) => (
            <tr key={without}>
              <td className="px-5 py-3 text-slate-500">{without}</td>
              <td className="px-5 py-3 text-slate-200">{withVal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
