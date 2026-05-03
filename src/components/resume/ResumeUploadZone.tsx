'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2,
  RefreshCw, Sparkles, MoreHorizontal, RefreshCcw, Trash2, X, AlertTriangle,
} from 'lucide-react'
import { track } from '@/lib/analytics'

interface ResumeUploadZoneProps {
  hasExistingResume: boolean
  resumeInfo?: { file_url: string; created_at: string; version: number } | null
}

type UploadState = 'idle' | 'uploading' | 'analyzing' | 'success' | 'no-text'

export function ResumeUploadZone({ hasExistingResume, resumeInfo }: ResumeUploadZoneProps) {
  const router = useRouter()
  const [uploadState, setUploadState]   = useState<UploadState>('idle')
  const [menuOpen, setMenuOpen]         = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const menuRef                         = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setUploadState('uploading')
    const formData = new FormData()
    formData.append('file', file)

    // ── Step 1: Upload (fatal — bail out if this fails) ────────────────────
    try {
      const uploadRes  = await fetch('/api/resume/upload', { method: 'POST', body: formData })
      const uploadData = await uploadRes.json()

      if (!uploadRes.ok) {
        toast.error(uploadData.error ?? 'Upload failed')
        setUploadState('idle')
        return
      }
      if (!uploadData.hasText) {
        setUploadState('no-text')
        toast.warning('Could not extract text — file may be image-based. Please paste your resume text.')
        return
      }
    } catch {
      toast.error('Upload failed. Please check your connection and try again.')
      setUploadState('idle')
      return
    }

    // ── Step 2: Analyze (non-fatal — always redirect to Matched Jobs) ───────
    setUploadState('analyzing')
    toast.info('Analyzing your profile and matching jobs…')

    try {
      const analyzeRes = await fetch('/api/resume/analyze', { method: 'POST' })
      let analyzeData: Record<string, unknown> = {}
      try { analyzeData = await analyzeRes.json() } catch { /* non-JSON response (e.g. 504 timeout page) */ }

      if (analyzeRes.ok) {
        track.resumeUpload()
        toast.success(`Found ${analyzeData.matchCount ?? 0} job matches! Redirecting…`)
      } else {
        toast.warning(
          (analyzeData.error as string) ?? 'Analysis took too long. Your resume is saved — search for jobs on the Matches page.'
        )
      }
    } catch {
      toast.warning('Job analysis timed out. Your resume is saved — you can search for jobs on the Matches page.')
    }

    setUploadState('success')
    setTimeout(() => router.push('/matches'), 2000)
  }, [router])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    disabled: uploadState !== 'idle',
  })

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch('/api/resume', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to delete resume')
        return
      }
      toast.success('Resume deleted successfully')
      setShowConfirm(false)
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const busy      = uploadState === 'uploading' || uploadState === 'analyzing'
  const fileName  = resumeInfo?.file_url
    ? decodeURIComponent(resumeInfo.file_url.split('/').pop()?.split('?')[0] ?? 'resume')
        .replace(/^\d+-/, '')
    : null
  const uploadDate = resumeInfo?.created_at
    ? new Date(resumeInfo.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <>
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── LEFT: Drag-drop zone ─────────────────────────────── */}
        <div
          {...getRootProps()}
          className={[
            'flex flex-col items-center justify-center text-center rounded-xl border-2 border-dashed p-8 min-h-[200px] cursor-pointer transition-all duration-150',
            isDragActive
              ? 'border-[#2563EB] bg-blue-50 dark:bg-[#1E3A5F]'
              : 'border-[#E5E7EB] dark:border-[#334155] hover:border-[#2563EB]/50 hover:bg-[#F8FAFC] dark:hover:bg-[#263549]',
            busy ? 'opacity-70 pointer-events-none' : '',
          ].join(' ')}
        >
          <input {...getInputProps()} />

          {uploadState === 'uploading' && (
            <>
              <Loader2 className="w-10 h-10 text-[#2563EB] animate-spin mb-3" />
              <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Uploading…</p>
              <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-1">Please wait</p>
            </>
          )}

          {uploadState === 'analyzing' && (
            <>
              <Loader2 className="w-10 h-10 text-[#2563EB] animate-spin mb-3" />
              <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Analyzing your profile…</p>
              <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-1">Parsing · Matching jobs · Scoring</p>
              <p className="text-[11px] text-gray-300 dark:text-slate-600 mt-1.5">This takes 30–60 seconds</p>
            </>
          )}

          {uploadState === 'success' && (
            <>
              <CheckCircle2 className="w-10 h-10 text-green-500 mb-3" />
              <p className="font-semibold text-[14px] text-green-600">Done! Redirecting…</p>
            </>
          )}

          {uploadState === 'no-text' && (
            <>
              <AlertCircle className="w-10 h-10 text-amber-500 mb-3" />
              <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Image-based file detected</p>
              <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-1">Please paste your resume text instead</p>
            </>
          )}

          {uploadState === 'idle' && (
            <>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                isDragActive ? 'bg-[#2563EB]/10' : 'bg-[#F8FAFC] dark:bg-[#263549]'
              }`}>
                <UploadCloud className={`w-7 h-7 ${isDragActive ? 'text-[#2563EB]' : 'text-gray-300 dark:text-slate-600'}`} />
              </div>
              <p className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">
                {isDragActive ? 'Drop your resume here' : 'Upload or drag & drop your resume'}
              </p>
              <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-1.5">PDF or Word (.doc / .docx) · Max 5 MB</p>
              <button
                type="button"
                className="mt-4 inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-semibold hover:bg-[#1E293B] dark:hover:bg-blue-700 hover:scale-[1.02] active:scale-100 transition-all shadow-sm"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                {hasExistingResume ? 'Replace Resume' : 'Upload Resume'}
              </button>
            </>
          )}
        </div>

        {/* ── RIGHT: File info or tips ─────────────────────────── */}
        {hasExistingResume && resumeInfo ? (
          <div className="flex flex-col rounded-xl border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#1E293B] overflow-hidden h-full">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0F172A] dark:text-[#F1F5F9]" />
                <span className="font-bold text-[14px] text-[#0F172A] dark:text-[#F1F5F9]">Active Resume</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                Ready
              </span>
            </div>

            {/* File row */}
            <div className="flex items-center gap-3 px-5 py-3 flex-1">
              <div className="w-10 h-10 rounded-xl bg-[#F8FAFC] dark:bg-[#263549] border border-[#E5E7EB] dark:border-[#334155] flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-[#2563EB]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[13px] text-[#0F172A] dark:text-[#F1F5F9] truncate">{fileName}</p>
                <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                  Updated {uploadDate}{resumeInfo.version > 1 ? ` · v${resumeInfo.version}` : ''}
                </p>
              </div>

              {/* 3-dot menu */}
              <div ref={menuRef} className="relative flex-shrink-0">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 dark:text-slate-600 hover:bg-[#F8FAFC] dark:hover:bg-[#334155] hover:text-gray-500 dark:hover:text-slate-400 transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-lg z-20 overflow-hidden py-1">
                    <button
                      onClick={() => { setMenuOpen(false); document.querySelector<HTMLInputElement>('input[type="file"]')?.click() }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-600 dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors text-left"
                    >
                      <RefreshCcw className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                      Replace Resume
                    </button>
                    <div className="border-t border-[#F1F5F9] dark:border-[#334155] my-1" />
                    <button
                      onClick={() => { setMenuOpen(false); setShowConfirm(true) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-left"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Resume
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Status banner */}
            <div className="flex items-center gap-2 px-5 py-3 bg-[#F8FAFC] dark:bg-[#0F172A]/40 border-t border-[#E5E7EB] dark:border-[#334155]">
              <CheckCircle2 className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
              <span className="text-[12px] font-semibold text-gray-500 dark:text-slate-400">Parsed &amp; ready for job matching</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col justify-center gap-3 rounded-xl bg-[#F8FAFC] dark:bg-[#263549] border border-[#E5E7EB] dark:border-[#334155] p-6">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-[#2563EB]" />
              <p className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F1F5F9]">What happens after upload?</p>
            </div>
            {[
              'AI parses your resume into structured data',
              'Skills, experience & education are extracted',
              'Jobs are fetched and matched to your profile',
              'A match score is generated for each listing',
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#2563EB] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[9px] font-bold text-white">{i + 1}</span>
                </div>
                <p className="text-[12px] text-gray-600 dark:text-slate-400 leading-snug">{step}</p>
              </div>
            ))}
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />Processing takes approximately 30–60 seconds
            </p>
          </div>
        )}
      </div>
    </div>

    {/* ── Delete confirmation modal ─────────────────────────────────────── */}
    {showConfirm && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={() => !deleting && setShowConfirm(false)}
      >
        <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px]" />
        <div
          className="relative w-full max-w-[420px] bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={() => setShowConfirm(false)}
            disabled={deleting}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#263549] transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon */}
          <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>

          <h2 className="text-[17px] font-black text-[#0F172A] dark:text-[#F1F5F9] mb-1.5">Delete Resume?</h2>
          <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed mb-6">
            This will remove your current resume and all related data including job matches and scores.
            This action cannot be undone.
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] dark:border-[#334155] text-[13px] font-semibold text-gray-600 dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {deleting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Deleting…</>
                : <><Trash2 className="w-3.5 h-3.5" />Delete</>}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
