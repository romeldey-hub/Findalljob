import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'DevOps Engineer Jobs | Match Your Cloud & CI/CD Skills | FindAllJob',
  description: 'Find better-fit DevOps Engineer jobs matched to your cloud, CI/CD, and infrastructure skills. AI resume matching for AWS, Kubernetes, Terraform, and more.',
  alternates: { canonical: 'https://www.findalljob.com/jobs-for-devops-engineers' },
  openGraph: {
    title: 'DevOps Engineer Jobs | FindAllJob',
    description: 'Match your DevOps skills with relevant cloud, CI/CD, and infrastructure roles.',
    url: 'https://www.findalljob.com/jobs-for-devops-engineers',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'DevOps Engineer Jobs | FindAllJob', description: 'Find DevOps Engineer jobs matched to your AWS, Kubernetes, and CI/CD skills.' },
}

const cfg: RoleJobConfig = {
  role: 'DevOps Engineer',
  roleLower: 'DevOps engineer',
  subheadline: 'Match your cloud, CI/CD, and infrastructure skills with relevant DevOps Engineer roles — from SRE positions to platform engineering and cloud-native infrastructure jobs.',
  intro: 'DevOps Engineers sit at the intersection of software development and IT operations. They build and maintain the systems that allow engineering teams to ship software reliably, quickly, and at scale. As companies move to cloud-native architectures and adopt platform engineering practices, DevOps has become a critical discipline across every industry.',
  whyCompetitive: 'DevOps is a broad field that encompasses cloud infrastructure, CI/CD, security, monitoring, and platform engineering. Job descriptions vary widely — some roles are heavily Kubernetes and microservices-focused, while others are primarily cloud automation or SRE. Resume matching ensures you find roles that match your actual specialization.',
  skills: [
    { title: 'Cloud Platforms', body: 'AWS, GCP, or Azure — core services like compute (EC2, GKE, AKS), storage (S3, GCS), networking (VPC, Load Balancers), and managed databases.' },
    { title: 'Kubernetes & Containerization', body: 'Docker, Kubernetes cluster management, Helm charts, service mesh (Istio), and container security. Increasingly required at mid-level and above.' },
    { title: 'Infrastructure as Code', body: 'Terraform, Pulumi, AWS CDK, or CloudFormation. Automating infrastructure provisioning, state management, and environment consistency.' },
    { title: 'CI/CD Pipelines', body: 'GitHub Actions, GitLab CI, Jenkins, CircleCI, or ArgoCD. Building automated build, test, and deployment pipelines for fast and reliable software delivery.' },
    { title: 'Monitoring & Observability', body: 'Prometheus, Grafana, Datadog, ELK stack, or Jaeger. Setting up metrics, logs, traces, and alerting to maintain system reliability.' },
    { title: 'Scripting & Automation', body: 'Python, Bash, or Go for automation scripts, tooling, and internal developer platform components. Strong scripting skills underpin most DevOps work.' },
  ],
  howItHelps: [
    { title: 'Cloud Provider Matching', body: 'AWS, GCP, and Azure experience is not interchangeable in many roles. FindAllJob matches your cloud specialization to roles requiring your specific provider and services.' },
    { title: 'SRE vs DevOps vs Platform Engineering', body: 'These overlapping roles have different emphases. AI matching considers your actual experience — reliability engineering, platform tooling, or pipeline automation — and matches accordingly.' },
    { title: 'Certification Recognition', body: 'AWS, GCP, and CKAD/CKA certifications signal proficiency in specific tools. Resume parsing recognizes certifications and boosts your match score for relevant roles.' },
    { title: 'Resume Optimization for Infrastructure Roles', body: 'DevOps JDs are highly specific about required tools. AI ensures your resume uses the exact terminology (Terraform vs IaC, Kubernetes vs K8s, GitHub Actions vs CI/CD pipelines) that each JD uses.' },
  ],
  resumeTips: [
    { title: 'Quantify Reliability and Scale', body: '"Maintained infrastructure" is weak. "Managed Kubernetes clusters serving 200M monthly requests with 99.97% uptime across 3 AWS regions" demonstrates real impact and scale.' },
    { title: 'List Your Certifications Prominently', body: 'AWS Solutions Architect, CKA, GCP Professional, or Terraform Associate certifications carry significant weight in DevOps hiring. List them in a dedicated certifications section, not buried in skills.' },
    { title: 'Show Developer Experience Impact', body: 'DevOps is ultimately about enabling developer velocity. Quantify how your work improved it: "Reduced deployment time from 45 min to 8 min" or "Enabled 20 engineers to deploy independently via self-service platform."' },
  ],
  interviewTips: [
    { title: 'Prepare for Infrastructure Design Questions', body: '"Design a highly available architecture for a web application on AWS" is a common interview question. Practice end-to-end cloud architecture design covering compute, networking, storage, load balancing, and disaster recovery.' },
    { title: 'Know Your Kubernetes Fundamentals', body: 'For roles involving Kubernetes, expect questions on pods, deployments, services, ingress, resource limits, namespaces, and cluster networking. Know how to troubleshoot a failing pod and debug cluster issues.' },
    { title: 'Incident Response Scenarios', body: 'SRE and DevOps interviews often include incident scenarios: "Production is down — walk me through your response." Practice structured incident response: detect, triage, communicate, mitigate, resolve, and post-mortem.' },
  ],
  faqs: [
    { q: 'What is the difference between DevOps and SRE?', a: 'DevOps is a broad methodology for breaking down silos between development and operations. SRE (Site Reliability Engineering) is a specific implementation of DevOps principles developed at Google — it applies software engineering to operations, with a focus on reliability, error budgets, and SLOs. Many companies use the terms interchangeably, so check the JD carefully.' },
    { q: 'What certifications are most valuable for DevOps engineers?', a: 'AWS Certified Solutions Architect and AWS DevOps Engineer Professional are the most recognized. Certified Kubernetes Administrator (CKA) and Certified Kubernetes Application Developer (CKAD) are highly valued for K8s-heavy roles. Terraform Associate is increasingly sought for IaC-focused positions.' },
    { q: 'What is the salary for DevOps Engineers in India?', a: 'Entry-level DevOps engineers earn ₹8–14 LPA. Mid-level with 3–5 years and cloud certifications earn ₹18–35 LPA. Senior DevOps/SRE roles at product companies earn ₹40–70 LPA or more.' },
    { q: 'Is DevOps a good career for the future?', a: 'Yes. Cloud adoption continues to grow, and the need for engineers who can build and maintain cloud infrastructure is increasing. Platform engineering — a natural evolution of DevOps — is a growing specialization with strong long-term prospects.' },
    { q: 'How does FindAllJob match me with DevOps jobs?', a: 'FindAllJob AI reads your resume and extracts your specific cloud provider, IaC tools, CI/CD platforms, orchestration experience, and certifications. It matches you to DevOps roles where your exact skill set is required — not just any infrastructure role.' },
  ],
  relatedLinks: [
    { label: 'Jobs for Cloud Engineers',          href: '/jobs-for-cloud-engineers' },
    { label: 'Jobs for Software Engineers',       href: '/jobs-for-software-engineers' },
    { label: 'Jobs for Full Stack Developers',    href: '/jobs-for-full-stack-developers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="DevOps Engineer" slug="jobs-for-devops-engineers" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
