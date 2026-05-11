import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'Cybersecurity Analyst Jobs | Match Your Security Skills | FindAllJob',
  description: 'Find better-fit Cybersecurity Analyst jobs matched to your security skills, certifications, and domain expertise. AI resume matching for SOC, VAPT, and cloud security roles.',
  alternates: { canonical: 'https://www.findalljob.com/jobs-for-cybersecurity-analysts' },
  openGraph: {
    title: 'Cybersecurity Analyst Jobs | FindAllJob',
    description: 'Match your security skills and certifications with relevant cybersecurity roles.',
    url: 'https://www.findalljob.com/jobs-for-cybersecurity-analysts',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'Cybersecurity Analyst Jobs | FindAllJob', description: 'Find Cybersecurity Analyst jobs matched to your security skills and certifications.' },
}

const cfg: RoleJobConfig = {
  role: 'Cybersecurity Analyst',
  roleLower: 'cybersecurity analyst',
  subheadline: 'Find Cybersecurity Analyst jobs matched to your specific security domain — SOC analysis, VAPT, cloud security, threat intelligence, or compliance — not just any security role.',
  intro: 'Cybersecurity is one of the fastest-growing fields in technology, driven by increasing regulatory requirements, rising cyber threats, and the growing attack surface of cloud-first organizations. Cybersecurity Analysts protect organizations from threats through monitoring, incident response, vulnerability assessment, and security architecture.',
  whyCompetitive: 'Cybersecurity roles are highly specialized — a SOC analyst, a penetration tester, and a cloud security engineer all hold security roles but require very different skills. Matching your specific security domain to the right job posting is essential to avoid mismatched applications and wasted effort.',
  skills: [
    { title: 'SIEM & Threat Monitoring', body: 'Splunk, Microsoft Sentinel, IBM QRadar, or Elastic SIEM. Log analysis, alert triage, and threat detection in security operations center (SOC) environments.' },
    { title: 'Vulnerability Assessment & Penetration Testing', body: 'VAPT tools including Nmap, Metasploit, Burp Suite, Nessus, and OWASP methodologies for identifying and exploiting security vulnerabilities.' },
    { title: 'Incident Response', body: 'Incident triage, containment, eradication, and post-incident analysis. Experience with digital forensics and building IR playbooks.' },
    { title: 'Cloud Security', body: 'AWS, GCP, or Azure security — IAM, security groups, GuardDuty, Security Hub, and cloud-native security monitoring and hardening.' },
    { title: 'Compliance & Frameworks', body: 'ISO 27001, SOC 2, PCI DSS, GDPR, and NIST Cybersecurity Framework. Audit preparation, gap analysis, and control implementation.' },
    { title: 'Network Security', body: 'Firewalls, IDS/IPS, VPN, zero trust architecture, network segmentation, and understanding of TCP/IP, DNS, and common attack vectors.' },
  ],
  howItHelps: [
    { title: 'Security Domain Matching', body: 'SOC, VAPT, cloud security, GRC, and threat intelligence are distinct specializations. FindAllJob matches your specific domain to roles that require it — not any security role.' },
    { title: 'Certification Recognition', body: 'CEH, OSCP, CISSP, CompTIA Security+, and AWS Security Specialty certifications are recognized from your resume and factored into role matching.' },
    { title: 'Industry-Specific Matching', body: 'Security roles in fintech, healthcare, and defense have different compliance and domain requirements. AI matching considers your industry security experience.' },
    { title: 'Resume Optimization for Security Roles', body: 'Security JDs use highly specific terminology. AI ensures your resume uses the right tool names, frameworks, and methodologies that each posting requires.' },
  ],
  resumeTips: [
    { title: 'List Certifications Prominently', body: 'OSCP, CISSP, CEH, CompTIA Security+, and cloud security certifications carry significant weight in security hiring. Put them in a dedicated, visible section — not buried in a skills list.' },
    { title: 'Quantify Incidents and Vulnerabilities', body: '"Responded to security incidents" is weak. "Investigated and contained 3 ransomware incidents with zero data exfiltration; reduced mean time to detect (MTTD) from 48 hours to 6 hours" demonstrates real impact.' },
    { title: 'Be Specific About Your Security Stack', body: 'List specific tools: Splunk, Burp Suite, Nessus, CrowdStrike, Palo Alto — not just "security tools." Many JDs require specific tool experience, and specificity improves ATS match scores significantly.' },
  ],
  interviewTips: [
    { title: 'Prepare for Scenario-Based Questions', body: '"You notice unusual outbound traffic from a server at 2 AM — walk me through your investigation." Practice structured incident response thinking: detect, triage, contain, investigate, remediate, document.' },
    { title: 'Know Your Attack Vectors', body: 'Common security interview questions cover phishing, SQL injection, XSS, privilege escalation, lateral movement, and social engineering. Know how each attack works and how to detect and prevent it.' },
    { title: 'For VAPT Roles — Prepare Your Methodology', body: 'Penetration testing interviews often ask you to walk through your methodology: reconnaissance, scanning, exploitation, post-exploitation, and reporting. Prepare a structured answer using real examples from authorized engagements.' },
  ],
  faqs: [
    { q: 'What qualifications do I need for a cybersecurity analyst job?', a: 'A degree in computer science, IT, or a related field helps but is not always required. More important are relevant certifications (CompTIA Security+, CEH, or OSCP for offensive roles), hands-on experience with security tools, and demonstrated ability to respond to security events. Platforms like TryHackMe and HackTheBox are valuable for building practical skills.' },
    { q: 'Is cybersecurity a good career in India?', a: 'Yes. India has a significant cybersecurity talent shortage, and demand is growing rapidly across banking, fintech, healthcare, IT services, and government. Cybersecurity is consistently one of the best-compensated IT specializations.' },
    { q: 'What is the salary for Cybersecurity Analysts in India?', a: 'Entry-level security analysts earn ₹5–10 LPA. Mid-level analysts with 3–5 years and relevant certifications earn ₹15–30 LPA. Senior security engineers and managers earn ₹35–70 LPA or more, particularly in fintech and enterprise security.' },
    { q: 'What is the difference between a cybersecurity analyst and a penetration tester?', a: 'A cybersecurity analyst typically works defensively — monitoring, detecting, and responding to threats (blue team). A penetration tester (ethical hacker) works offensively — simulating attacks to find vulnerabilities before malicious actors do (red team). Both are important roles but require different skills and mindsets.' },
    { q: 'How does FindAllJob help cybersecurity professionals find relevant jobs?', a: 'FindAllJob AI reads your security resume, extracts your specific domain (SOC, VAPT, cloud security, GRC), tools, certifications, and industry experience — then matches you to cybersecurity roles where your background genuinely fits.' },
  ],
  relatedLinks: [
    { label: 'Jobs for Cloud Engineers',    href: '/jobs-for-cloud-engineers' },
    { label: 'Jobs for DevOps Engineers',   href: '/jobs-for-devops-engineers' },
    { label: 'Jobs for Software Engineers', href: '/jobs-for-software-engineers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="Cybersecurity Analyst" slug="jobs-for-cybersecurity-analysts" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
