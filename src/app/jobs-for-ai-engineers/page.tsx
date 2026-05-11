import type { Metadata } from 'next'
import { RoleJobPage, RoleJobSchema } from '@/components/seo/RoleJobPage'
import type { RoleJobConfig } from '@/components/seo/RoleJobPage'

export const metadata: Metadata = {
  title: 'AI Engineer Jobs | Find Roles That Match Your Skills & Projects | FindAllJob',
  description: 'Find AI Engineer jobs matched to your LLM, NLP, and ML engineering skills. Resume-based matching, AI resume optimization, and interview preparation — all in one place.',
  alternates: { canonical: 'https://findalljob.com/jobs-for-ai-engineers' },
  openGraph: {
    title: 'AI Engineer Jobs | FindAllJob',
    description: 'Find AI Engineer roles that match your skills, projects, and experience.',
    url: 'https://findalljob.com/jobs-for-ai-engineers',
    siteName: 'FindAllJob',
  },
  twitter: { card: 'summary_large_image', title: 'AI Engineer Jobs | FindAllJob', description: 'Find AI Engineer roles matched to your LLM, NLP, and ML engineering skills.' },
}

const cfg: RoleJobConfig = {
  role: 'AI Engineer',
  roleLower: 'AI engineer',
  subheadline: 'Find AI Engineer roles that match your specific skills — whether you build LLM applications, ML pipelines, NLP systems, or AI-powered products.',
  intro: 'AI Engineer is one of the fastest-growing and most well-compensated roles in technology today. As companies race to integrate generative AI, LLMs, and intelligent automation into their products, demand for engineers who can build, deploy, and maintain AI systems has surged dramatically across every industry.',
  whyCompetitive: 'The AI engineer job market is evolving rapidly, and job descriptions vary widely — from building RAG pipelines and prompt engineering frameworks to fine-tuning foundation models and deploying production ML APIs. Finding roles where your specific AI skills are genuinely required (not just listed as a nice-to-have) requires precision matching.',
  skills: [
    { title: 'LLM Application Development', body: 'Building applications on top of OpenAI, Claude, Gemini, or open-source models using LangChain, LlamaIndex, or direct API integration.' },
    { title: 'Retrieval-Augmented Generation (RAG)', body: 'Vector databases (Pinecone, FAISS, Weaviate, Chroma), embedding models, chunking strategies, and retrieval pipeline design.' },
    { title: 'ML Engineering & MLOps', body: 'Model serving (FastAPI, TorchServe), containerization (Docker, Kubernetes), experiment tracking (MLflow, W&B), and CI/CD for ML pipelines.' },
    { title: 'Fine-Tuning & RLHF', body: 'Parameter-efficient fine-tuning (LoRA, QLoRA), instruction tuning, RLHF/DPO for alignment, and working with HuggingFace Transformers.' },
    { title: 'Python & Deep Learning Frameworks', body: 'PyTorch, TensorFlow, JAX. Strong Python engineering skills — not just notebooks, but production-grade code.' },
    { title: 'Prompt Engineering & Evaluation', body: 'Designing, testing, and optimizing prompts. Building evaluation frameworks to measure LLM output quality, accuracy, and safety.' },
  ],
  howItHelps: [
    { title: 'AI-Specific Skill Extraction', body: 'FindAllJob AI extracts your specific AI stack — LLM frameworks, vector DBs, fine-tuning experience, and deployment tools — and matches you to roles that actually require those skills.' },
    { title: 'Project and Portfolio Recognition', body: 'AI engineer roles often value project experience as much as work history. The resume parser recognizes open-source contributions, side projects, and Kaggle/hackathon work.' },
    { title: 'Role Type Differentiation', body: 'AI engineer roles differ significantly — applied AI, research engineering, MLOps, and AI product engineering are distinct. FindAllJob matching considers your role orientation, not just keywords.' },
    { title: 'Resume Optimization for Fast-Moving JDs', body: 'AI job descriptions change faster than any other engineering category. Resume optimization ensures your resume matches the current terminology and stack requirements of each posting.' },
  ],
  resumeTips: [
    { title: 'Lead With Your AI Stack, Not Just "AI"', body: 'Generic "AI/ML experience" is too vague. List specific: "Built production RAG pipeline using LangChain, Pinecone, and GPT-4 API serving 50K monthly users." Specificity is what differentiates strong AI engineer resumes.' },
    { title: 'Include Your Projects Prominently', body: 'AI engineering is a new enough field that impactful side projects, GitHub repos, or contributions to open-source AI tools often carry more weight than titles and years alone.' },
    { title: 'Highlight Deployment and Scale Experience', body: 'Many candidates can prototype AI features. Fewer can deploy them to production at scale. If you have production deployment experience with AI systems, make it the most prominent part of each role description.' },
  ],
  interviewTips: [
    { title: 'Prepare for System Design with AI Components', body: 'Expect questions like "Design a customer support chatbot with RAG" or "How would you build a document summarization pipeline that scales to 1M documents?" Practice end-to-end AI system design covering data ingestion, embedding, retrieval, generation, evaluation, and monitoring.' },
    { title: 'Understand LLM Fundamentals', body: 'Know how transformers work, what attention mechanisms do, the difference between fine-tuning and RAG, how to evaluate LLM outputs, and when each approach is appropriate. These come up in technical screening calls.' },
    { title: 'Be Ready to Discuss Trade-offs', body: 'AI engineering interviews often explore trade-off reasoning: fine-tune vs RAG, open-source vs API, latency vs accuracy, cost vs quality. Prepare structured answers to these comparison questions using your real project experience.' },
  ],
  faqs: [
    { q: 'What is an AI Engineer?', a: 'An AI Engineer builds, deploys, and maintains AI-powered systems and applications. This includes working with large language models (LLMs), building RAG pipelines, fine-tuning models, developing ML APIs, and integrating AI into products. The role is distinct from a data scientist (who focuses on analysis and model research) and an ML engineer (who focuses on training infrastructure).' },
    { q: 'Do I need a research background to become an AI Engineer?', a: 'No. Most AI engineer roles are applied — they require strong software engineering skills combined with the ability to work with AI frameworks and APIs. A research background helps for research engineer roles, but the majority of AI engineering positions value practical implementation experience over academic research.' },
    { q: 'What is the salary for AI Engineers in India?', a: 'AI Engineers in India earn ₹15–30 LPA at the entry-to-mid level, with senior AI engineers and those with LLM specialization earning ₹35–80 LPA or more. The field is new and compensation is rising rapidly as demand outpaces supply.' },
    { q: 'Is AI Engineer a stable career?', a: 'AI engineering skills are in very high demand and the field is growing. While the specific tools and frameworks evolve quickly, the underlying skills (building AI systems, working with models, deploying at scale) are durable. Engineers who understand the fundamentals adapt as the technology changes.' },
    { q: 'How does FindAllJob help me find AI engineer jobs?', a: 'FindAllJob AI reads your resume and extracts your specific AI stack — LLM frameworks, vector databases, fine-tuning experience, and deployment tools. It then ranks AI engineer job matches by how closely the role requirements align with your actual skills and experience.' },
  ],
  relatedLinks: [
    { label: 'Jobs for Machine Learning Engineers', href: '/jobs-for-machine-learning-engineers' },
    { label: 'Jobs for Data Scientists',            href: '/jobs-for-data-scientists' },
    { label: 'Jobs for Cloud Engineers',            href: '/jobs-for-cloud-engineers' },
  ],
}

export default function Page() {
  return (
    <>
      <RoleJobSchema role="AI Engineer" slug="jobs-for-ai-engineers" faqs={cfg.faqs} />
      <RoleJobPage cfg={cfg} />
    </>
  )
}
