import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'Data Scientist Jobs | Match Your Resume with Relevant Roles | FindAllJob',
  description: 'Find better-fit Data Scientist jobs matched to your ML skills, tools, and experience. Optimize your resume for each role and prepare for technical interviews with AI.',
  alternates: { canonical: 'https://www.findalljob.com/jobs-for-data-scientists' },
  openGraph: {
    type: 'website',
    title: 'Data Scientist Jobs | FindAllJob',
    description: 'Match your resume with relevant Data Scientist jobs. AI-ranked by your skills and experience.',
    url: 'https://www.findalljob.com/jobs-for-data-scientists',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'Data Scientist Jobs | FindAllJob', description: 'Find Data Scientist jobs matched to your ML skills and experience.' },
}

const cfg: RoleJobConfig = {
  role: 'Data Scientist',
  roleLower: 'data scientist',
  subheadline: 'Upload your resume and get AI-ranked Data Scientist job matches based on your machine learning skills, Python expertise, and domain experience.',
  intro: 'Data Scientist is one of the most sought-after roles in the technology industry, spanning machine learning, statistical modelling, NLP, computer vision, and applied AI. Roles range from building production ML pipelines at large tech companies to early-stage research at AI startups.',
  whyCompetitive: 'The data science job market is competitive because the role requires a broad combination of skills — programming, statistics, domain knowledge, and communication. Employers increasingly prefer candidates who can not only build models but also explain results to non-technical stakeholders and deploy models into production.',
  skills: [
    { title: 'Python (ML Stack)', body: 'Scikit-learn, TensorFlow, PyTorch, XGBoost, and Keras. Most data science roles require production-ready Python ML code.' },
    { title: 'Statistics & Probability', body: 'Hypothesis testing, distributions, Bayesian methods, regression, and experimental design for A/B testing and causal inference.' },
    { title: 'Machine Learning', body: 'Supervised and unsupervised learning, model evaluation, feature engineering, cross-validation, and hyperparameter tuning.' },
    { title: 'Data Wrangling', body: 'Pandas, NumPy, SQL, and Spark for cleaning, transforming, and preparing large datasets for modelling.' },
    { title: 'MLOps & Deployment', body: 'Model serving with Flask/FastAPI, MLflow for experiment tracking, Docker, and cloud deployment (AWS SageMaker, GCP Vertex AI).' },
    { title: 'Domain Specialization', body: 'NLP, computer vision, recommendation systems, time series forecasting, or fraud detection — domain depth significantly boosts match scores.' },
  ],
  howItHelps: [
    { title: 'Specialization Matching', body: 'AI extracts your ML specialization (NLP, CV, tabular, time series) from your resume and prioritizes roles that match your specific domain expertise.' },
    { title: 'Experience Level Fit', body: 'Data science roles range from junior analyst-adjacent to senior research scientist. FindAllJob matches your seniority to the right level automatically.' },
    { title: 'JD-Specific Resume Optimization', body: 'Data science JDs vary widely in required skills. AI rewrites your resume to match the specific frameworks, tools, and techniques each role emphasizes.' },
    { title: 'Technical Interview Preparation', body: 'AI mock interviews generate statistics, ML theory, coding, and case study questions tailored to the specific role and company you are targeting.' },
  ],
  resumeTips: [
    { title: 'Showcase Model Impact, Not Just Model Building', body: '"Built a churn prediction model" is weak. "Built a churn prediction model (XGBoost, 89% recall) deployed to production, reducing churn by 18% over 6 months" is what gets interviews.' },
    { title: 'Include a Projects Section', body: 'For data scientists — especially early career — a strong projects section (Kaggle competitions, open source contributions, personal ML projects) can outweigh work experience gaps.' },
    { title: 'Be Specific About Your Stack', body: 'List specific versions and tools: "PyTorch 2.x, HuggingFace Transformers, LangChain, FAISS for vector search" tells a technical recruiter far more than "deep learning."' },
  ],
  interviewTips: [
    { title: 'Prepare for Statistics Questions', body: 'Expect questions on p-values, confidence intervals, Type I/II errors, and when to use which statistical test. These are common screening questions even for applied ML roles.' },
    { title: 'Practice ML System Design', body: 'Senior roles often include a system design round: "Design a recommendation system for an e-commerce platform." Practice end-to-end ML system design covering data, features, model choice, serving, and monitoring.' },
    { title: 'Prepare Case Studies from Your Work', body: 'Prepare 2–3 detailed case studies of your most impactful ML projects. Cover: problem definition, data challenges, model choices and why, evaluation methodology, deployment, and business outcome.' },
  ],
  faqs: [
    { q: 'What is the difference between a data scientist and a machine learning engineer?', a: 'Data scientists focus on experimentation, analysis, and model development. ML engineers focus on deploying, scaling, and maintaining those models in production. Many companies blend the roles — check the JD carefully for where each role sits on this spectrum.' },
    { q: 'Do I need a PhD to get a data scientist job?', a: 'No. A PhD helps for research-focused roles at large tech companies and research labs, but the majority of data scientist jobs at product companies and startups hire candidates with a strong Bachelor\'s or Master\'s degree, a good portfolio, and demonstrated ML skills.' },
    { q: 'What is the salary for data scientists in India?', a: 'Entry-level data scientists earn ₹8–15 LPA in India. Mid-level (3–6 years) earn ₹18–35 LPA. Senior data scientists and those with deep ML specialization can earn ₹40–80 LPA at top tech companies.' },
    { q: 'Which industries hire the most data scientists in India?', a: 'Technology and SaaS companies are the largest employers. Significant demand also comes from fintech (fraud detection, credit scoring), e-commerce (recommendation, demand forecasting), healthcare, and consulting firms building AI practices.' },
    { q: 'How does FindAllJob help data scientists find relevant jobs?', a: 'FindAllJob AI reads your data scientist resume, extracts your specific ML frameworks, domain expertise, and seniority, then ranks job matches by how closely the JD requirements match your actual profile — not just keyword overlap.' },
  ],
  relatedLinks: [
    { label: 'Jobs for Data Analysts',           href: '/jobs-for-data-analysts' },
    { label: 'Jobs for AI Engineers',             href: '/jobs-for-ai-engineers' },
    { label: 'Jobs for Machine Learning Engineers', href: '/jobs-for-machine-learning-engineers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="Data Scientist" slug="jobs-for-data-scientists" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
