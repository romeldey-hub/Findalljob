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
  const [editing, setEditing]             = useState(false)
  const [saving, setSaving]               = useState(false)
  const [name, setName]                   = useState(initialName)
  const [headline, setHeadline]           = useState(initialHeadline)
  const [savedHeadline, setSavedHeadline] = useState(initialHeadline)
  const [isHeadlineEdited, setIsHeadlineEdited] = useState(initialIsHeadlineEdited)

  // Avatar state — separate from the edit/save cycle
  const [avatarSrc, setAvatarSrc]         = useState<string | null>(initialAvatarUrl)
  const [avatarUploading, setAvatarUploading] = useState(false)
  // Prevent a stale router.refresh() prop from overwriting a freshly uploaded avatar
  const justUploadedRef                   = useRef<string | null>(null)

  useEffect(() => {
    if (justUploadedRef.current !== null) {
      justUploadedRef.current = null
      return
    }
    setAvatarSrc(initialAvatarUrl)
  }, [initialAvatarUrl])

  const fileInputRef     = useRef<HTMLInputElement>(null)
  const headlineInputRef = useRef<HTMLInputElement>(null)

  // Poll for AI-generated headline if the server didn't have one yet
  useEffect(() => {
    if (initialHeadline) return
    let attempts = 0
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const res = await fetch('/api/profile/headline')
        if (!res.ok) return
        const data = await res.json()
        if (data?.headline) {
          setHeadline(data.headline)
          setSavedHeadline(data.headline)
          return
        }
      } catch { /* retry */ }
      if (++attempts < 10) timer = setTimeout(poll, 3000)
    }
    timer = setTimeout(poll, 2000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (editing) headlineInputRef.current?.focus()
  }, [editing])

  const initials = name
    .split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase() || 'U'

  // ── Immediate avatar upload ───────────────────────────────────────────────
  // Upload fires the moment the user picks a file — no Save button required.
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so re-selecting the same file triggers onChange again
    e.target.value = ''

    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return }

    // Show local preview instantly while upload runs in background
    const previewUrl = URL.createObjectURL(file)
    setAvatarSrc(previewUrl)
    setAvatarUploading(true)

    try {
      const dataUrl = await compressAvatar(file)

      const res = await fetch('/api/profile/upload-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: dataUrl }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        const msg = payload?.error ?? 'Failed to upload image. Please try again.'
        console.error('[ProfileCard] upload error:', msg)
        throw new Error(msg)
      }

      const { publicUrl } = await res.json() as { publicUrl: string }
      console.log('[ProfileCard] upload success. URL:', publicUrl)

      URL.revokeObjectURL(previewUrl)
      justUploadedRef.current = publicUrl
      setAvatarSrc(publicUrl)
      toast.success('Profile photo updated successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload image. Please try again.'
      toast.error(msg, { duration: 6000 })
      URL.revokeObjectURL(previewUrl)
      setAvatarSrc(initialAvatarUrl) // revert to last known good value
    } finally {
      setAvatarUploading(false)
    }
  }

  function handleCancel() {
    setEditing(false)
    setName(initialName)
    setHeadline(savedHeadline)
    // Avatar is saved immediately on upload — do not revert it here
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name cannot be empty'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name.trim(), headline: headline.trim() }),
      })
      if (!res.ok) throw new Error('Profile update failed')

      const supabase = createClient()
      await supabase.auth.updateUser({ data: { headline: headline.trim() } })

      toast.success('Profile updated successfully')
      setSavedHeadline(headline.trim())
      setIsHeadlineEdited(true)
      setEditing(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save changes')
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

            {/* Upload spinner overlay */}
            {avatarUploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[#2563EB] border-2 border-white flex items-center justify-center hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
              title="Change photo"
            >
              <Camera className="w-3.5 h-3.5 text-white" />
            </button>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="text-[12px] font-semibold text-[#2563EB] hover:underline transition-colors disabled:opacity-50"
          >
            {avatarUploading ? 'Uploading…' : 'Upload Photo'}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

// Resize + centre-crop to 256×256 JPEG
function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img    = new Image()
    const blobUrl = URL.createObjectURL(file)
    img.onload = () => {
      const SIZE = 256
      const canvas = document.createElement('canvas')
      canvas.width  = SIZE
      canvas.height = SIZE
      const ctx  = canvas.getContext('2d')!
      const side = Math.min(img.width, img.height)
      const sx   = (img.width  - side) / 2
      const sy   = (img.height - side) / 2
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE)
      URL.revokeObjectURL(blobUrl)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = blobUrl
  })
}
