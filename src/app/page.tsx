import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FileText, Briefcase, Wand2, Kanban, MessageSquare, ArrowRight } from 'lucide-react'

const features = [
  {
    icon: FileText,
    title: 'AI Resume Parsing',
    description: 'Upload your PDF and Claude instantly extracts your profile into structured data.',
  },
  {
    icon: Briefcase,
    title: 'Smart Job Matching',
    description: 'AI scores every job listing against your profile — no more manual keyword searching.',
  },
  {
    icon: Wand2,
    title: 'Resume Optimizer',
    description: 'Claude rewrites your resume tailored to each specific job with ATS keywords injected.',
  },
  {
    icon: Kanban,
    title: 'Application Tracker',
    description: 'Kanban board to track every application from saved → offer.',
  },
  {
    icon: MessageSquare,
    title: 'Follow-up Generator',
    description: 'AI writes personalized cold outreach, follow-ups, and thank-you notes.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">Find All Job</span>
        </div>
        <div className="flex gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">Sign In</Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Get Started Free</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center py-20 px-6">
        <Badge variant="secondary" className="mb-4">Powered by Claude AI</Badge>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight max-w-2xl mx-auto leading-tight">
          Land your next job with AI on your side
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
          Upload your resume. AI matches you to jobs, tailors your application, and helps you follow up — all in one place.
        </p>
        <div className="mt-8 flex gap-3 justify-center flex-wrap">
          <Link href="/signup">
            <Button size="lg" className="gap-2">
              Start Free <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">Sign In</Button>
          </Link>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Free plan includes 3 AI actions/month. No credit card required.</p>
      </section>

      {/* Features */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">Everything you need to get hired faster</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title}>
              <CardHeader className="pb-2">
                <Icon className="w-5 h-5 text-primary mb-1" />
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-16 bg-muted/30">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-10">Simple pricing</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Free</CardTitle>
                <div className="text-3xl font-bold">$0</div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>3 AI actions per month</p>
                <p>Job matching</p>
                <p>Application tracker</p>
                <Link href="/signup" className="block mt-4">
                  <Button variant="outline" className="w-full">Get Started</Button>
                </Link>
              </CardContent>
            </Card>
            <Card className="border-primary">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Pro</CardTitle>
                  <Badge>Popular</Badge>
                </div>
                <div className="text-3xl font-bold">$29<span className="text-base font-normal text-muted-foreground">/mo</span></div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Unlimited AI actions</p>
                <p>Everything in Free</p>
                <p>Priority AI processing</p>
                <Link href="/signup" className="block mt-4">
                  <Button className="w-full">Start Pro</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <footer className="border-t px-6 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Find All Job. Built with Claude AI.
      </footer>
    </div>
  )
}
