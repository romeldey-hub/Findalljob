'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Camera, Loader2, Pencil, X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ProfileCardProps {
  userId: string
  initialName: string
  email: string
  initialHeadline: string
  initialIsHeadlineEdited: boolean
  initialAvatarUrl: string | null
}

export function ProfileCard({
  userId, initialName, email, initialHeadline, initialIsHeadlineEdited, initialAvatarUrl,
}: ProfileCardProps) {
  const router = useRouter()
  const [editing, setEditing]               = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [name, setName]                     = useState(initialName)
  const [headline, setHeadline]             = useState(initialHeadline)
  // last persisted value — used only for Cancel revert
  const [savedHeadline, setSavedHeadline]   = useState(initialHeadline)
  // mirrors DB is_headline_edited; true once user saves a manual edit — persists across refreshes
  const [isHeadlineEdited, setIsHeadlineEdited] = useState(initialIsHeadlineEdited)
  // Sync avatarSrc when the server re-renders with a new initialAvatarUrl
  // (e.g. after router.refresh() following a successful upload)
  const [avatarSrc, setAvatarSrc]           = useState<string | null>(initialAvatarUrl)
  useEffect(() => { setAvatarSrc(initialAvatarUrl) }, [initialAvatarUrl])
  const [avatarFile, setAvatarFile]         = useState<File | null>(null)
  const fileInputRef                        = useRef<HTMLInputElement>(null)
  const headlineInputRef                    = useRef<HTMLInputElement>(null)

  // If the server rendered an empty headline, poll until the async AI generation completes
  useEffect(() => {
    if (initialHeadline) return // server already has it — nothing to do

    let attempts = 0
    const MAX_ATTEMPTS = 10 // ~30 seconds total
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const res = await fetch('/api/profile/headline')
        if (!res.ok) return
        const data = await res.json()
        console.log('Fetched Headline:', data?.headline)
        if (data?.headline) {
          setHeadline(data.headline)
          setSavedHeadline(data.headline)
          // don't touch isHeadlineEdited — DB value is authoritative
          return // found — stop polling
        }
      } catch {
        // network error — retry
      }
      attempts++
      if (attempts < MAX_ATTEMPTS) {
        timer = setTimeout(poll, 3000)
      }
    }

    // First check after 2 s — gives the analyze route time to finish
    timer = setTimeout(poll, 2000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // runs once on mount; initialHeadline is stable at render time

  // Focus the headline input whenever editing mode is entered
  useEffect(() => {
    if (editing) headlineInputRef.current?.focus()
  }, [editing])

  const initials = name
    .split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase() || 'U'

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return }
    setAvatarFile(file)
    setAvatarSrc(URL.createObjectURL(file))
  }

  function handleCancel() {
    setEditing(false)
    setName(initialName)
    setHeadline(savedHeadline)
    setAvatarSrc(initialAvatarUrl)
    setAvatarFile(null)
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name cannot be empty'); return }
    setSaving(true)
    try {
      // 1 — compress + upload avatar if changed
      if (avatarFile) {
        const newAvatarDataUrl = await compressAvatar(avatarFile)
        const res = await fetch('/api/profile/upload-avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar_url: newAvatarDataUrl }),
        })
        if (!res.ok) throw new Error('Avatar save failed')
        const { publicUrl } = await res.json() as { publicUrl: string }
        setAvatarSrc(publicUrl)
      }

      // 2 — save full_name + headline to profiles table (headline falls back gracefully if column missing)
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name.trim(), headline: headline.trim() }),
      })
      if (!res.ok) throw new Error('Profile update failed')

      // 3 — also persist headline in user_metadata so it survives until DB migration runs
      const supabase = createClient()
      await supabase.auth.updateUser({ data: { headline: headline.trim() } })

      toast.success('Profile updated successfully')
      setSavedHeadline(headline.trim())
      setIsHeadlineEdited(true) // DB was updated; mirror it in client state
      setEditing(false)
      setAvatarFile(null)
      router.refresh()
    } catch {
      toast.error('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">Profile Information</h2>
          <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">Update your personal information and profile picture.</p>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-semibold text-gray-600 dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-[#263549] hover:border-gray-300 hover:scale-[1.02] active:scale-100 transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-[#334155] text-[12px] font-semibold text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-[#263549] transition-all"
            >
              <X className="w-3.5 h-3.5" />Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] text-white text-[12px] font-semibold hover:bg-[#1E293B] dark:hover:bg-blue-700 hover:scale-[1.02] active:scale-100 transition-all disabled:opacity-50"
            >
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                : <><Check className="w-3.5 h-3.5" />Save Changes</>}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-8">
        {/* ── Avatar ──────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 flex-shrink-0">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center ring-4 ring-[#F8FAFC] overflow-hidden">
              {avatarSrc
                ? <img src={avatarSrc} alt="" className="w-full h-full object-cover" onError={() => setAvatarSrc(null)} />
                : <span className="text-2xl font-bold text-white">{initials}</span>}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[#2563EB] border-2 border-white flex items-center justify-center hover:bg-blue-700 transition-colors shadow-sm"
              title="Change photo"
            >
              <Camera className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[12px] font-semibold text-[#2563EB] hover:underline transition-colors"
          >
            Upload Photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* ── Form ────────────────────────────────────────────── */}
        <div className="flex-1 space-y-4">
          <Field label="Full Name">
            <input
              type="text"
              value={name}
              disabled={!editing}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className={inputClass(editing)}
            />
          </Field>

          <Field label="Email Address">
            <input
              type="email"
              value={email}
              disabled
              className={inputClass(false)}
            />
          </Field>

          <Field
            label="Headline"
            hint={
              isHeadlineEdited
                ? 'Edited by you. This will be used across your profile.'
                : 'Auto-generated from your resume. You can edit it anytime.'
            }
          >
            <input
              ref={headlineInputRef}
              type="text"
              value={headline}
              disabled={!editing}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. Senior Software Engineer | Cloud & DevOps | Fintech"
              className={inputClass(editing)}
            />
          </Field>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

function inputClass(editable: boolean) {
  return [
    'w-full px-3.5 py-2.5 rounded-xl border text-[13px] outline-none transition-all',
    editable
      ? 'bg-white dark:bg-[#263549] border-[#E5E7EB] dark:border-[#334155] text-[#0F172A] dark:text-[#F1F5F9] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10'
      : 'bg-[#F8FAFC] dark:bg-[#1A2942] border-transparent text-gray-500 dark:text-slate-500 cursor-default',
  ].join(' ')
}

// Resize + crop image to 128×128 JPEG data URL so it fits in user_metadata
function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const blobUrl = URL.createObjectURL(file)
    img.onload = () => {
      const SIZE = 128
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')!
      // Centre-crop to square
      const side = Math.min(img.width, img.height)
      const sx   = (img.width  - side) / 2
      const sy   = (img.height - side) / 2
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE)
      URL.revokeObjectURL(blobUrl)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = blobUrl
  })
}
