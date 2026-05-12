'use client'

import { useState } from 'react'
import { ArrowRight, ChevronRight, Sparkles, X } from 'lucide-react'
import { LocationPickerInput } from './LocationPickerInput'

export interface QAAnswers {
  target_role:             string
  fresher_or_experienced:  string
  education:               string
  work_experience:         string
  skills:                  string
  certifications:          string
  preferred_location:      string
  contact:                 string
}

const EMPTY_ANSWERS: QAAnswers = {
  target_role:            '',
  fresher_or_experienced: '',
  education:              '',
  work_experience:        '',
  skills:                 '',
  certifications:         '',
  preferred_location:     '',
  contact:                '',
}


function ContactPickerInput({
  value,
  onChange,
}: {
  value:    string
  onChange: (v: string) => void
}) {
  const parts = value ? value.split(' · ') : []
  const [name,  setName]  = useState(parts[0] ?? '')
  const [email, setEmail] = useState(parts[1] ?? '')
  const [phone, setPhone] = useState(parts[2] ?? '')

  function sync(n: string, e: string, p: string) {
    onChange([n, e, p].filter(Boolean).join(' · '))
  }

  const inputCls = [
    'w-full px-4 py-3 text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-xl',
    'bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F1F5F9]',
    'placeholder-gray-300 dark:placeholder-slate-600',
    'focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]',
  ].join(' ')

  const labelCls = 'block text-[12px] font-semibold text-[#0F172A] dark:text-[#F1F5F9] mb-1.5'

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className={labelCls}>Full Name</label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); sync(e.target.value, email, phone) }}
          placeholder="e.g. Ananya Sharma"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Email Address</label>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); sync(name, e.target.value, phone) }}
          placeholder="e.g. ananya@email.com"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Phone Number</label>
        <input
          type="tel"
          value={phone}
          onChange={e => { setPhone(e.target.value); sync(name, email, e.target.value) }}
          placeholder="e.g. +91 98765 43210"
          className={inputCls}
        />
      </div>
    </div>
  )
}

interface Step {
  key: keyof QAAnswers
  icon:        string
  question:    string
  hint:        string
  placeholder: string
  multiline?:  boolean
  options?:    string[]
  dropdown?:   boolean
  locationPicker?:  boolean
  contactPicker?:   boolean
  optional?:        boolean
}

const STEPS: Step[] = [
  {
    key:         'target_role',
    icon:        '🎯',
    question:    'What kind of jobs are you targeting?',
    hint:        'Be specific — this helps AI tailor your resume.',
    placeholder: 'e.g. Frontend Developer, Data Analyst, Product Manager…',
  },
  {
    key:         'fresher_or_experienced',
    icon:        '💼',
    question:    'Are you a fresher or do you have work experience?',
    hint:        'This shapes how your resume is structured.',
    placeholder: 'Select your experience level',
    dropdown:    true,
    options:     [
      'Fresher / Entry-level — 0–1 year',
      'Early career — 1–3 years',
      'Mid-level — 3–5 years',
      'Experienced professional — 5–8 years',
      'Senior professional — 8–12 years',
      'Lead / Manager level — 12–15 years',
      'Senior leadership — 15+ years',
    ],
  },
  {
    key:         'education',
    icon:        '🎓',
    question:    'What is your highest education?',
    hint:        'Include degree, field, college name, and year.',
    placeholder: 'e.g. B.Tech in Computer Science from IIT Delhi, 2023',
  },
  {
    key:         'work_experience',
    icon:        '🏢',
    question:    'Tell us about your work experience, internships, or projects.',
    hint:        'Write naturally — AI will structure it into bullets.',
    placeholder: 'e.g. SDE intern at Swiggy for 6 months, built a real-time order tracking dashboard in React…\nOr: Final year project — ML model to predict loan defaults with 92% accuracy…',
    multiline:   true,
  },
  {
    key:         'skills',
    icon:        '⚡',
    question:    'What are your key skills and tools?',
    hint:        'Separate with commas.',
    placeholder: 'e.g. Python, React, SQL, Figma, Docker, TensorFlow…',
  },
  {
    key:         'certifications',
    icon:        '🏆',
    question:    'Any certifications or achievements?',
    hint:        'Awards, courses, hackathons, or publications.',
    placeholder: 'e.g. AWS Solutions Architect, Google Data Analytics Certificate, Won HackIndia 2023…',
    optional:    true,
  },
  {
    key:            'preferred_location',
    icon:           '📍',
    question:       'Where would you prefer to work?',
    hint:           "We've pre-filled your likely country. You can change it or select International.",
    placeholder:    'Start typing a country name',
    locationPicker: true,
  },
  {
    key:           'contact',
    icon:          '📋',
    question:      'What are your contact details?',
    hint:          'Add the details you want to show on your resume.',
    placeholder:   '',
    contactPicker: true,
  },
]

export function AIResumeBuilder({
  onComplete,
  onClose,
  defaultCountry,
}: {
  onComplete:      (answers: QAAnswers) => void
  onClose:         () => void
  defaultCountry?: string
}) {
  const [step,    setStep]    = useState(0)
  const [answers, setAnswers] = useState<QAAnswers>(EMPTY_ANSWERS)

  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1

  function updateAnswer(value: string) {
    setAnswers(prev => ({ ...prev, [current.key]: value }))
  }

  function handleNext() {
    if (isLast) {
      onComplete(answers)
    } else {
      setStep(s => s + 1)
    }
  }

  function handleSkip() {
    setAnswers(prev => ({ ...prev, [current.key]: '' }))
    if (isLast) {
      onComplete(answers)
    } else {
      setStep(s => s + 1)
    }
  }

  function handleBack() {
    if (step > 0) setStep(s => s - 1)
  }

  const value = answers[current.key]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] dark:border-[#334155]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Create Resume with AI</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 px-6 pt-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={[
                'h-1.5 rounded-full transition-all duration-300',
                i < step  ? 'flex-1 bg-[#2563EB]' :
                i === step ? 'flex-[2] bg-[#2563EB]' :
                             'flex-1 bg-[#E5E7EB] dark:bg-[#334155]',
              ].join(' ')}
            />
          ))}
        </div>
        <p className="px-6 pt-2 text-[11px] text-gray-400 dark:text-slate-500">
          Question {step + 1} of {STEPS.length}
        </p>

        {/* Question body */}
        <div className="px-6 py-6 flex-1">
          <div className="text-3xl mb-3">{current.icon}</div>
          <h2 className="font-bold text-[17px] text-[#0F172A] dark:text-[#F1F5F9] leading-snug mb-1">
            {current.question}
          </h2>
          <p className="text-[12px] text-gray-400 dark:text-slate-500 mb-5">{current.hint}</p>

          {/* Contact picker */}
          {current.contactPicker ? (
            <ContactPickerInput
              value={value}
              onChange={updateAnswer}
            />
          ) : current.locationPicker ? (
            <LocationPickerInput
              value={value}
              onChange={updateAnswer}
              defaultCountry={defaultCountry}
            />
          ) : current.dropdown && current.options ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                Experience level
              </label>
              <select
                autoFocus
                value={value}
                onChange={e => updateAnswer(e.target.value)}
                className="w-full px-4 py-3 text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-xl bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] appearance-none cursor-pointer"
              >
                <option value="" disabled>Select your experience level</option>
                {current.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          ) : current.options ? (
            <div className="flex flex-col gap-2">
              {current.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => { updateAnswer(opt); setStep(s => s + 1) }}
                  className={[
                    'flex items-center justify-between px-4 py-3 rounded-xl border text-[13px] font-medium text-left transition-all',
                    value === opt
                      ? 'border-[#2563EB] bg-blue-50 dark:bg-[#1E3A5F] text-[#2563EB]'
                      : 'border-[#E5E7EB] dark:border-[#334155] text-[#0F172A] dark:text-[#F1F5F9] hover:border-[#2563EB]/50 hover:bg-[#F8FAFC] dark:hover:bg-[#263549]',
                  ].join(' ')}
                >
                  {opt}
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 flex-shrink-0" />
                </button>
              ))}
            </div>
          ) : current.multiline ? (
            <textarea
              autoFocus
              rows={5}
              value={value}
              onChange={e => updateAnswer(e.target.value)}
              placeholder={current.placeholder}
              className="w-full px-4 py-3 text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-xl bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-none leading-relaxed"
            />
          ) : (
            <input
              autoFocus
              type="text"
              value={value}
              onChange={e => updateAnswer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && value.trim()) handleNext() }}
              placeholder={current.placeholder}
              className="w-full px-4 py-3 text-[13px] border border-[#E5E7EB] dark:border-[#334155] rounded-xl bg-white dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
            />
          )}
        </div>

        {/* Footer */}
        {(!current.options || current.dropdown) && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#E5E7EB] dark:border-[#334155]">
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={handleBack}
                  className="px-3 py-2 rounded-lg text-[12px] font-medium text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors"
                >
                  ← Back
                </button>
              )}
              {current.optional && (
                <button
                  onClick={handleSkip}
                  className="px-3 py-2 rounded-lg text-[12px] font-medium text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors"
                >
                  Skip
                </button>
              )}
            </div>

            <button
              onClick={handleNext}
              disabled={!value.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLast ? 'Build My Resume' : 'Next'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Footer for card option-step (Back only) */}
        {current.options && !current.dropdown && (
          <div className="flex items-center px-6 py-3 border-t border-[#E5E7EB] dark:border-[#334155]">
            {step > 0 && (
              <button
                onClick={handleBack}
                className="px-3 py-2 rounded-lg text-[12px] font-medium text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#334155] transition-colors"
              >
                ← Back
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
