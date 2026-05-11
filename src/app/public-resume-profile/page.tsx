import type { Metadata } from 'next'
import { SeoPage, SeoSection, FeatureGrid, CompareTable } from '@/components/seo/SeoPage'

export const metadata: Metadata = {
  title: 'Public Resume Profile — Get Discovered by Recruiters Online | FindAllJob',
  description: 'Create a public resume profile on FindAllJob and get discovered by recruiters. Share a professional profile link, showcase your skills and experience, and let opportunities come to you.',
  alternates: { canonical: 'https://www.findalljob.com/public-resume-profile' },
  openGraph: {
    title: 'Public Resume Profile | FindAllJob',
    description: 'Create a public profile and get discovered by recruiters. Free to start.',
    url: 'https://www.findalljob.com/public-resume-profile',
    siteName: 'FindAllJob',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Public Resume Profile | FindAllJob',
    description: 'Create a public resume profile and get discovered by recruiters online.',
  },
}

const features = [
  { title: 'Your Own Profile URL', body: 'Get a shareable public URL at findalljob.com/yourname that you can add to your email signature, LinkedIn, and job applications.' },
  { title: 'Structured Resume Display', body: 'Your skills, experience, education, and certifications are displayed cleanly — easy for recruiters to scan in seconds.' },
  { title: 'Recruiter Discoverable', body: 'Public profiles are indexed by search engines. Recruiters searching for specific skills and experience can find your profile organically.' },
  { title: 'PDF Export', body: 'Download your public profile as a formatted PDF resume at any time — ready to submit with job applications.' },
  { title: 'Social Links', body: 'Add your LinkedIn, GitHub, portfolio, or other professional links to make your profile a complete professional presence.' },
  { title: 'Always Up to Date', body: 'Update your profile once — your public URL always reflects your latest experience, skills, and headline.' },
]

const compareRows = [
  { label: '', without: 'Only applying to jobs you find', with: 'Recruiters also find you through your public profile' },
  { label: '', without: 'Sending a different PDF resume every time', with: 'One shareable link with your full professional profile' },
  { label: '', without: 'Profile buried in LinkedIn with millions of others', with: 'Dedicated public page optimized for search indexing' },
  { label: '', without: 'No online presence outside job portals', with: 'Indexable resume profile that works for you passively' },
]

const faqs = [
  { q: 'What is a public resume profile?', a: 'A public resume profile is a web page at findalljob.com/yourname that displays your professional experience, skills, education, and contact links. It is publicly accessible and search engine indexed — allowing recruiters to discover you beyond active job applications.' },
  { q: 'Who can see my public profile?', a: 'Anyone with your profile URL can view it. It is also indexed by search engines like Google, so it may appear in search results when someone searches your name or skill set.' },
  { q: 'Can I control what is shown on my public profile?', a: 'Yes. You control your headline, summary, social links, and which sections are visible. You can enable or disable your public profile at any time from your settings.' },
  { q: 'Is a public profile better than LinkedIn?', a: 'They serve different purposes and work best together. LinkedIn is a social network. Your FindAllJob public profile is a clean, recruiter-focused resume page optimized for discoverability. Use both — add your FindAllJob profile link to your LinkedIn.' },
  { q: 'Will my public profile be indexed by Google?', a: 'Yes. Public profiles on FindAllJob are structured for SEO with proper metadata, canonical URLs, and schema markup — making them indexable by Google and other search engines.' },
  { q: 'How do I create a public profile?', a: 'Upload your resume to FindAllJob, then go to Settings and enable your public profile. Your profile page is generated automatically from your resume data — no manual setup required.' },
]

const relatedLinks = [
  { label: 'AI Resume Optimizer', href: '/ai-resume-optimizer' },
  { label: 'Resume Job Matching', href: '/resume-job-matching' },
  { label: 'Career Advice', href: '/career-advice' },
  { label: 'ATS Resume Checker', href: '/ats-resume-checker' },
]

export default function PublicResumeProfilePage() {
  return (
    <SeoPage
      headline="Create a Public Resume Profile — Get Discovered by Recruiters"
      subheadline="Your job search should not be one-directional. Create a public profile on FindAllJob and let recruiters find you — through Google, direct links, and professional networks."
      ctaLabel="Create Public Profile"
      faqs={faqs}
      relatedLinks={relatedLinks}
    >
      <SeoSection title="Active and Passive Job Searching">
        <p className="text-slate-400 text-[15px] leading-relaxed mb-6">
          Most job seekers only search actively — browsing job boards, applying, waiting. A public resume profile makes your job search passive too. Once your profile is live and indexed, recruiters can find you 24/7 without any effort on your part.
        </p>
        <CompareTable rows={compareRows} />
      </SeoSection>

      <SeoSection title="What Your Public Profile Includes">
        <FeatureGrid items={features} />
      </SeoSection>

      <SeoSection title="How to Set Up Your Public Profile">
        <ol className="space-y-4 text-[15px] text-slate-400">
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">1.</span><span><strong className="text-white">Create your free account</strong> — Sign up at FindAllJob in seconds.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">2.</span><span><strong className="text-white">Upload your resume</strong> — AI parses your skills, experience, and education automatically.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">3.</span><span><strong className="text-white">Enable your public profile</strong> — Go to Settings → Public Profile and turn it on.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">4.</span><span><strong className="text-white">Add your links and headline</strong> — Customize your professional headline and add LinkedIn, GitHub, or portfolio links.</span></li>
          <li className="flex gap-3"><span className="font-black text-blue-400 flex-shrink-0">5.</span><span><strong className="text-white">Share your URL</strong> — Add findalljob.com/yourname to your email signature, LinkedIn, and resume header.</span></li>
        </ol>
      </SeoSection>
    </SeoPage>
  )
}
