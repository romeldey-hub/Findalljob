import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'Cloud Engineer Jobs | Match Your AWS, GCP & Azure Skills | FindAllJob',
  description: 'Find better-fit Cloud Engineer jobs matched to your specific cloud platform skills. Resume-based AI matching for AWS, GCP, Azure, and multi-cloud infrastructure roles.',
  alternates: { canonical: 'https://www.findalljob.com/jobs-for-cloud-engineers' },
  openGraph: {
    type: 'website',
    title: 'Cloud Engineer Jobs | FindAllJob',
    description: 'Match your AWS, GCP, or Azure skills with relevant cloud infrastructure roles.',
    url: 'https://www.findalljob.com/jobs-for-cloud-engineers',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'Cloud Engineer Jobs | FindAllJob', description: 'Find Cloud Engineer jobs matched to your specific cloud platform and skills.' },
}

const cfg: RoleJobConfig = {
  role: 'Cloud Engineer',
  roleLower: 'cloud engineer',
  subheadline: 'Find Cloud Engineer jobs matched to your specific cloud platform, architecture skills, and certifications — whether you specialize in AWS, GCP, Azure, or multi-cloud environments.',
  intro: 'Cloud Engineers design, build, and manage cloud infrastructure that enables organizations to run their applications reliably and cost-effectively. As nearly every company migrates workloads to the cloud and adopts cloud-native architectures, demand for experienced cloud engineers continues to grow across all industries.',
  whyCompetitive: 'Cloud engineering roles are highly provider-specific — deep AWS expertise does not automatically translate to GCP or Azure roles. Resume-based matching ensures you apply to roles aligned with your specific cloud provider experience, certified skills, and architecture specialization.',
  skills: [
    { title: 'Cloud Platforms', body: 'Deep expertise in at least one major cloud: AWS, GCP, or Azure. Core services across compute, networking, storage, databases, and security.' },
    { title: 'Cloud Architecture', body: 'Designing scalable, highly available, fault-tolerant architectures. Well-Architected Framework principles, multi-region design, and disaster recovery.' },
    { title: 'Infrastructure as Code', body: 'Terraform, AWS CDK, Pulumi, or Bicep (Azure). Automating infrastructure provisioning and ensuring consistent, repeatable environments.' },
    { title: 'Networking & Security', body: 'VPC design, subnetting, security groups, IAM policies, PrivateLink, VPN, and cloud security best practices and compliance.' },
    { title: 'Cost Optimization', body: 'Right-sizing, reserved instances, spot usage, cloud cost monitoring tools (AWS Cost Explorer, GCP Cost Management), and FinOps practices.' },
    { title: 'Managed Services', body: 'Deep knowledge of cloud-native managed services — RDS, EKS, Cloud Run, BigQuery, Azure AKS — and when to use them vs self-managed alternatives.' },
  ],
  howItHelps: [
    { title: 'Provider-Specific Matching', body: 'AWS, GCP, and Azure experience is rarely interchangeable for mid-to-senior roles. FindAllJob matches your specific cloud provider to roles that require it.' },
    { title: 'Certification Recognition', body: 'AWS Solutions Architect, GCP Professional Cloud Architect, and Azure Solutions Architect certifications are recognized from your resume and factored into matching.' },
    { title: 'Architecture vs Operations Fit', body: 'Some cloud roles are architecture-focused, others are day-to-day operations and cost management. AI matching considers your actual role orientation.' },
    { title: 'Resume Optimization for Cloud JDs', body: 'Cloud JDs use highly specific terminology. AI ensures your resume uses the exact service names, certifications, and architecture patterns each job posting requires.' },
  ],
  resumeTips: [
    { title: 'Lead With Your Cloud Provider and Certifications', body: 'State your primary cloud provider and relevant certifications in your summary: "AWS Certified Solutions Architect Professional with 5 years of AWS experience across fintech and SaaS." This immediately qualifies you for relevant roles.' },
    { title: 'Quantify Scale and Cost Impact', body: '"Managed cloud infrastructure" is generic. "Designed multi-region AWS architecture serving 500K daily users; implemented cost optimization strategy reducing monthly AWS spend by 35% (₹40L/month savings)" demonstrates real impact.' },
    { title: 'Include Specific Services, Not Just Platform Names', body: 'List specific AWS/GCP/Azure services you have used: EKS, RDS Aurora, Lambda, API Gateway, CloudFront, Route53 — not just "AWS." Specificity directly improves your ATS match score for cloud roles.' },
  ],
  interviewTips: [
    { title: 'Prepare Cloud Architecture Design Questions', body: '"Design a globally distributed application on AWS with 99.99% uptime" is a standard cloud engineer interview question. Practice covering: regions, availability zones, load balancing, database replication, CDN, and failover strategy.' },
    { title: 'Know Your Security Model', body: 'Cloud security questions are common: IAM policies, least-privilege access, encryption at rest and in transit, network isolation with VPCs, and compliance frameworks (SOC2, ISO 27001, PCI DSS for fintech). Prepare specific examples from your experience.' },
    { title: 'Be Ready to Discuss Cost Trade-offs', body: 'Senior cloud roles increasingly require FinOps awareness. Be ready to explain how you balance performance, reliability, and cost — and provide examples of cost optimization work from your experience.' },
  ],
  faqs: [
    { q: 'What does a cloud engineer do?', a: 'A cloud engineer designs, builds, and manages cloud infrastructure. This includes provisioning cloud resources, designing network architecture, ensuring security and compliance, managing costs, and enabling engineering teams to deploy applications reliably on cloud platforms.' },
    { q: 'Which cloud certification is most valuable?', a: 'AWS Certified Solutions Architect (Associate and Professional) is the most widely recognized globally. For India-based roles, AWS certifications are the most common employer requirement, followed by GCP and Azure. The best certification is the one that matches the cloud provider your target companies use.' },
    { q: 'What is the salary for Cloud Engineers in India?', a: 'Cloud engineers with 2–3 years experience and a relevant certification earn ₹12–22 LPA. Senior cloud architects with 5+ years earn ₹30–55 LPA. Cloud engineering is one of the best-compensated infrastructure specializations.' },
    { q: 'Is cloud engineering the same as DevOps?', a: 'They overlap but are distinct. Cloud engineering focuses specifically on cloud infrastructure design, architecture, and managed services. DevOps is broader and includes CI/CD pipelines, deployment automation, and developer tooling — often using cloud infrastructure as a component.' },
    { q: 'How does FindAllJob help cloud engineers find the right roles?', a: 'FindAllJob AI extracts your cloud provider, specific services, certifications, and architecture experience from your resume — and matches you to cloud engineering roles where your exact background is required, not just any infrastructure role.' },
  ],
  relatedLinks: [
    { label: 'Jobs for DevOps Engineers',         href: '/jobs-for-devops-engineers' },
    { label: 'Jobs for Software Engineers',       href: '/jobs-for-software-engineers' },
    { label: 'Jobs for Full Stack Developers',    href: '/jobs-for-full-stack-developers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="Cloud Engineer" slug="jobs-for-cloud-engineers" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
