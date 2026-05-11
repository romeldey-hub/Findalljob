import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'Machine Learning Engineer Jobs | Resume-Matched ML Roles | FindAllJob',
  description: 'Find better-fit Machine Learning Engineer jobs matched to your ML frameworks, deployment experience, and domain expertise. AI-powered resume matching for MLE roles.',
  alternates: { canonical: 'https://www.findalljob.com/jobs-for-machine-learning-engineers' },
  openGraph: {
    title: 'Machine Learning Engineer Jobs | FindAllJob',
    description: 'Find ML Engineer roles matched to your frameworks, deployment skills, and domain expertise.',
    url: 'https://www.findalljob.com/jobs-for-machine-learning-engineers',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'Machine Learning Engineer Jobs | FindAllJob', description: 'Find ML Engineer jobs matched to your skills and experience.' },
}

const cfg: RoleJobConfig = {
  role: 'Machine Learning Engineer',
  roleLower: 'machine learning engineer',
  subheadline: 'Find Machine Learning Engineer roles matched to your specific ML frameworks, deployment experience, and domain — from production ML pipelines to applied AI systems.',
  intro: 'Machine Learning Engineers sit at the intersection of data science and software engineering. Where data scientists build and experiment with models, ML engineers build the infrastructure to train, deploy, and scale those models reliably in production. The role is increasingly critical as companies move from ML experiments to production AI systems.',
  whyCompetitive: 'MLE roles are competitive because the skill set is broad — requiring strong software engineering, understanding of ML theory, and production systems experience. Finding roles that match your specific combination (training infrastructure vs inference systems vs feature platforms) requires precision matching beyond keyword search.',
  skills: [
    { title: 'ML Frameworks', body: 'PyTorch or TensorFlow for model development. Deep understanding of training loops, distributed training, and model optimization techniques.' },
    { title: 'MLOps & Model Serving', body: 'Model deployment with TorchServe, TF Serving, or Triton. Experiment tracking with MLflow or W&B. Feature stores (Feast, Tecton).' },
    { title: 'Distributed Training', body: 'Multi-GPU and multi-node training with PyTorch DDP, DeepSpeed, or Ray. Handling large model and data scale efficiently.' },
    { title: 'Data Pipelines', body: 'Building and maintaining training data pipelines using Spark, Airflow, dbt, or cloud-native ETL tools at scale.' },
    { title: 'Software Engineering Fundamentals', body: 'Strong Python, system design, API development, containerization (Docker), and production code quality — not just notebook-level code.' },
    { title: 'Model Evaluation & Monitoring', body: 'Offline and online evaluation frameworks, A/B testing for ML models, data drift detection, and production model performance monitoring.' },
  ],
  howItHelps: [
    { title: 'MLE vs Data Scientist Differentiation', body: 'FindAllJob AI distinguishes between ML Engineering roles (production systems, infrastructure) and Data Science roles (analysis, research) — matching you to the correct role type for your background.' },
    { title: 'Specialization Recognition', body: 'Training infrastructure, recommendation systems, NLP, computer vision, and real-time inference are distinct specializations. AI matching surfaces roles that match your actual area.' },
    { title: 'Resume Optimization for MLE Roles', body: 'MLE JDs emphasize production scale, system design, and engineering quality. AI optimization ensures these aspects of your experience are prominently featured for each role.' },
    { title: 'Technical Interview Preparation', body: 'AI mock interviews generate ML system design, coding, and ML theory questions tailored to the specific MLE role you are targeting.' },
  ],
  resumeTips: [
    { title: 'Emphasize Production Scale and Reliability', body: 'MLE hiring managers care about production systems, not just model accuracy. Highlight: model serving latency, throughput, uptime, and the engineering work required to achieve them at your scale.' },
    { title: 'Show the Full ML Lifecycle', body: 'Feature engineering → training → evaluation → deployment → monitoring → retraining. Show that you understand and have worked across the full lifecycle, not just one stage.' },
    { title: 'Distinguish Research from Production Work', body: 'Clearly separate experimental/research work (achieved X% accuracy improvement on Y task) from production work (deployed model serving 10M daily inferences with <50ms p99 latency). Both matter but are evaluated differently.' },
  ],
  interviewTips: [
    { title: 'Prepare ML System Design', body: '"Design a real-time recommendation system" or "Design a fraud detection pipeline" are classic MLE interview questions. Practice covering: data ingestion, feature engineering, model training infrastructure, serving architecture, evaluation, and monitoring.' },
    { title: 'Know Your ML Fundamentals', body: 'Backpropagation, gradient descent variants, regularization, batch normalization, attention mechanisms — these fundamentals come up in technical screening even for engineering-heavy roles.' },
    { title: 'Be Ready to Code Production-Quality ML Code', body: 'MLE coding rounds test software engineering quality, not just whether the model works. Practice writing clean, testable, efficient Python code — not just notebook-style scripts.' },
  ],
  faqs: [
    { q: 'How is an ML engineer different from a data scientist?', a: 'Data scientists focus on model development, experimentation, and analysis. ML engineers focus on building the infrastructure to train models at scale and deploy them reliably to production. In practice, many companies blend these responsibilities, but senior roles tend to specialize.' },
    { q: 'What is the salary for ML Engineers in India?', a: 'Entry-level ML engineers earn ₹12–20 LPA in India. Mid-level with strong production experience earn ₹25–50 LPA. Senior ML engineers at top product companies and unicorns earn ₹60–100 LPA or more.' },
    { q: 'Do I need a Master\'s degree for an ML engineer role?', a: 'Not always. A strong portfolio of production ML work, open-source contributions, or impactful projects can substitute for formal advanced degrees at many companies. Research-focused MLE roles at large labs often do prefer a Master\'s or PhD.' },
    { q: 'What is the most important skill for an ML engineer?', a: 'Strong software engineering fundamentals combined with sufficient ML depth to collaborate effectively with data scientists. Companies can teach ML theory to good engineers, but they cannot easily teach engineering discipline to ML researchers.' },
    { q: 'How does FindAllJob help ML engineers find relevant jobs?', a: 'FindAllJob AI reads your MLE resume and extracts your specific frameworks, production deployment experience, and domain specialization — then matches you to ML engineering roles where your background is a genuine fit, not just keyword overlap.' },
  ],
  relatedLinks: [
    { label: 'Jobs for AI Engineers',     href: '/jobs-for-ai-engineers' },
    { label: 'Jobs for Data Scientists',  href: '/jobs-for-data-scientists' },
    { label: 'Jobs for Cloud Engineers',  href: '/jobs-for-cloud-engineers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="Machine Learning Engineer" slug="jobs-for-machine-learning-engineers" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
