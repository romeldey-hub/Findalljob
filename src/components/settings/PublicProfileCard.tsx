'use client'

import { useState, useEffect, useRef } from 'react'
import { Globe, Lock, Check, Loader2, ExternalLink, Copy, X, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Settings {
  username:              string
  profile_public:        boolean
  show_email:            boolean
  show_phone:            boolean
  show_resume_download:  boolean
  open_to_opportunities: boolean
  linkedin_url:          string
  show_linkedin:         boolean
  x_url:                 string
  show_x:                boolean
  facebook_url:          string
  show_facebook:         boolean
}

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

const DEFAULT: Settings = {
  username:              '',
  profile_public:        false,
  show_email:            false,
  show_phone:            false,
  show_resume_download:  true,
  open_to_opportunities: true,
  linkedin_url:          '',
  show_linkedin:         false,
  x_url:                 '',
  show_x:                false,
  facebook_url:          '',
  show_facebook:         false,
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateSocialUrl(platform: 'linkedin' | 'x' | 'facebook', url: string): string | null {
  if (!url.trim()) return null
  const lower = url.toLowerCase()
  if (platform === 'linkedin' && !lower.includes('linkedin.com'))
    return 'Must be a linkedin.com URL'
  if (platform === 'x' && !lower.includes('x.com') && !lower.includes('twitter.com'))
    return 'Must be an x.com or twitter.com URL'
  if (platform === 'facebook' && !lower.includes('facebook.com'))
    return 'Must be a facebook.com URL'
  return null
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
  label, description, checked, onChange, disabled = false,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={`flex items-start justify-between gap-4 cursor-pointer ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[#0F172A] dark:text-[#F1F5F9]">{label}</p>
        {description && (
          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 leading-snug">{description}</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`flex-shrink-0 relative w-9 h-5 rounded-full transition-colors duration-200 ${
          checked ? 'bg-[#2563EB]' : 'bg-gray-200 dark:bg-slate-700'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </label>
  )
}

// ── Slug status indicator ─────────────────────────────────────────────────────

function SlugIndicator({ status, reason }: { status: SlugStatus; reason: string }) {
  if (status === 'idle') return null
  if (status === 'checking') return (
    <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-slate-500">
      <Loader2 className="w-3 h-3 animate-spin" />Checking…
    </span>
  )
  if (status === 'available') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600 dark:text-green-400">
      <Check className="w-3 h-3" />Available
    </span>
  )
  if (status === 'taken') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-red-500 dark:text-red-400">
      <X className="w-3 h-3" />{reason}
    </span>
  )
  if (status === 'invalid') return (
    <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
      <AlertCircle className="w-3 h-3" />{reason}
    </span>
  )
  return null
}

function inputBorderClass(status: SlugStatus, focused: boolean): string {
  if (status === 'available') return 'border-green-400 dark:border-green-600 ring-2 ring-green-400/15'
  if (status === 'taken')     return 'border-red-400 dark:border-red-600 ring-2 ring-red-400/15'
  if (status === 'invalid')   return 'border-amber-400 dark:border-amber-600 ring-2 ring-amber-400/15'
  if (focused)                return 'border-[#2563EB] ring-2 ring-[#2563EB]/20'
  return 'border-[#E5E7EB] dark:border-[#334155]'
}

function InputIcon({ status }: { status: SlugStatus }) {
  if (status === 'checking') return <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
  if (status === 'available') return <Check className="w-4 h-4 text-green-500" />
  if (status === 'taken')    return <X className="w-4 h-4 text-red-500" />
  if (status === 'invalid')  return <AlertCircle className="w-4 h-4 text-amber-500" />
  return null
}

// ── Social URL input ──────────────────────────────────────────────────────────

function SocialField({
  label, placeholder, value, error, show, disabled,
  onChangeUrl, onChangeShow,
}: {
  label: string
  placeholder: string
  value: string
  error: string | null
  show: boolean
  disabled: boolean
  onChangeUrl: (v: string) => void
  onChangeShow: (v: boolean) => void
}) {
  const [focused, setFocused] = useState(false)
  const borderClass = error
    ? 'border-amber-400 dark:border-amber-600 ring-2 ring-amber-400/15'
    : focused
    ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20'
    : 'border-[#E5E7EB] dark:border-[#334155]'

  const isDisabled = disabled || !value.trim()

  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{label}</p>
      <div className="flex items-center gap-2">
        <div className={`flex-1 flex items-center rounded-xl border transition-all duration-150 ${borderClass}`}>
          <input
            type="url"
            value={value}
            onChange={(e) => onChangeUrl(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 px-3 py-2 text-[13px] bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 outline-none rounded-xl min-w-0"
          />
        </div>
        <button
          role="switch"
          aria-label={`Show ${label} on profile`}
          aria-checked={show}
          onClick={() => !isDisabled && onChangeShow(!show)}
          className={`flex-shrink-0 relative w-9 h-5 rounded-full transition-colors duration-200 ${
            isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
          } ${show && !isDisabled ? 'bg-[#2563EB]' : 'bg-gray-200 dark:bg-slate-700'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${show && !isDisabled ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
        </p>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PublicProfileCard() {
  const [settings, setSettings] = useState<Settings>(DEFAULT)
  const [saved,    setSaved]    = useState<Settings>(DEFAULT)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [focused,  setFocused]  = useState(false)

  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle')
  const [slugReason, setSlugReason] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestCheck = useRef(0)

  const linkedinError = validateSocialUrl('linkedin', settings.linkedin_url)
  const xError        = validateSocialUrl('x',        settings.x_url)
  const facebookError = validateSocialUrl('facebook',  settings.facebook_url)
  const hasUrlErrors  = !!(linkedinError || xError || facebookError)

  const profileUrl = settings.username && slugStatus !== 'taken' && slugStatus !== 'invalid'
    ? `https://findalljob.com/${settings.username}`
    : null

  // Empty username is always valid (saves as null). Non-empty must be available or unchanged.
  const slugOk  = settings.username === ''
    || slugStatus === 'available'
    || (settings.username === saved.username && settings.username !== '')
  const isDirty = JSON.stringify(settings) !== JSON.stringify(saved)
  const canSave = isDirty && slugOk && !saving && !hasUrlErrors &&
                  slugStatus !== 'checking' && slugStatus !== 'taken' && slugStatus !== 'invalid'

  useEffect(() => {
    fetch('/api/profile/public-settings')
      .then((r) => r.json())
      .then((d) => {
        const s: Settings = {
          username:              d.username              ?? '',
          profile_public:        d.profile_public        ?? false,
          show_email:            d.show_email            ?? false,
          show_phone:            d.show_phone            ?? false,
          show_resume_download:  d.show_resume_download  ?? true,
          open_to_opportunities: d.open_to_opportunities ?? true,
          linkedin_url:          d.linkedin_url          ?? '',
          show_linkedin:         d.show_linkedin         ?? false,
          x_url:                 d.x_url                 ?? '',
          show_x:                d.show_x                ?? false,
          facebook_url:          d.facebook_url          ?? '',
          show_facebook:         d.show_facebook         ?? false,
        }
        setSettings(s)
        setSaved(s)
        if (s.username) setSlugStatus('idle')
      })
      .catch(() => toast.error('Failed to load profile settings'))
      .finally(() => setLoading(false))
  }, [])

  function handleUsernameChange(raw: string) {
    const value = raw.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSettings((p) => ({ ...p, username: value }))

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!value) { setSlugStatus('idle'); setSlugReason(''); return }

    if (value.length < 3)  { setSlugStatus('invalid'); setSlugReason('Too short — minimum 3 characters.'); return }
    if (value.length > 40) { setSlugStatus('invalid'); setSlugReason('Too long — maximum 40 characters.'); return }
    if (value.startsWith('-') || value.endsWith('-')) {
      setSlugStatus('invalid'); setSlugReason('Cannot start or end with a hyphen.'); return
    }
    if (value === saved.username) { setSlugStatus('available'); setSlugReason(''); return }

    setSlugStatus('checking')
    setSlugReason('')

    debounceRef.current = setTimeout(async () => {
      const seq = ++latestCheck.current
      try {
        const res  = await fetch(`/api/profile/check-username?username=${encodeURIComponent(value)}`)
        const data = await res.json()
        if (seq !== latestCheck.current) return
        setSlugStatus(data.status as SlugStatus)
        setSlugReason(data.reason ?? '')
      } catch {
        if (seq !== latestCheck.current) return
        setSlugStatus('idle')
      }
    }, 500)
  }

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((p) => ({ ...p, [key]: value }))
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const res = await fetch('/api/profile/public-settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to save'); return }
      setSaved(settings)
      toast.success('Public profile settings saved')
    } catch {
      toast.error('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function copyLink() {
    if (!profileUrl) return
    await navigator.clipboard.writeText(profileUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-[#2563EB]" />
          <h2 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">Public Resume</h2>
        </div>
        <div className="flex items-center gap-2 mt-4 text-[13px] text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          {settings.profile_public
            ? <Globe className="w-4 h-4 text-[#2563EB]" />
            : <Lock className="w-4 h-4 text-gray-400" />
          }
          <h2 className="font-bold text-[15px] text-[#0F172A] dark:text-[#F1F5F9]">Public Resume</h2>
        </div>
        {settings.profile_public && saved.username && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-[11px] font-semibold text-green-600 dark:text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Live
          </span>
        )}
      </div>
      <p className="text-[12px] text-gray-400 dark:text-slate-500 mb-6">
        Share your professional profile with recruiters and hiring managers.
      </p>

      <div className="space-y-5">

        {/* Username field */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-2">
            Your profile URL
          </label>
          <div className={`flex items-stretch rounded-xl border overflow-hidden transition-all duration-150 ${inputBorderClass(slugStatus, focused)}`}>
            <span className="flex items-center px-3 bg-[#F8FAFC] dark:bg-[#0F172A] text-[13px] text-gray-400 border-r border-[#E5E7EB] dark:border-[#334155] select-none flex-shrink-0">
              findalljob.com/
            </span>
            <input
              type="text"
              value={settings.username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="your-name"
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 px-3 py-2.5 text-[13px] bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F1F5F9] placeholder-gray-300 dark:placeholder-slate-600 outline-none min-w-0"
            />
            <span className="flex items-center pr-3">
              <InputIcon status={slugStatus} />
            </span>
          </div>
          <div className="mt-1.5 min-h-[18px]">
            <SlugIndicator status={slugStatus} reason={slugReason} />
          </div>
          {profileUrl && (
            <div className="flex items-center justify-between mt-1">
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-[#2563EB] hover:text-blue-700 flex items-center gap-1 transition-colors"
              >
                {profileUrl.replace('https://', '')}
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={copyLink}
                className="text-[11px] font-medium text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 flex items-center gap-1 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        <div className="h-px bg-[#E5E7EB] dark:bg-[#334155]" />

        {/* Visibility */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Visibility</p>
          <Toggle
            label="Public profile"
            description="Make your profile visible to anyone with the link."
            checked={settings.profile_public}
            onChange={(v) => set('profile_public', v)}
          />
        </div>

        <div className="h-px bg-[#E5E7EB] dark:bg-[#334155]" />

        {/* Privacy */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Privacy</p>
          <div className="space-y-4">
            <Toggle
              label="Show email address"
              description="Recruiters will see your email and can contact you directly."
              checked={settings.show_email}
              onChange={(v) => set('show_email', v)}
              disabled={!settings.profile_public}
            />
            <Toggle
              label="Show phone number"
              description="Display your phone number on the profile."
              checked={settings.show_phone}
              onChange={(v) => set('show_phone', v)}
              disabled={!settings.profile_public}
            />
            <Toggle
              label="Allow resume download"
              description="Recruiters can download a PDF of your profile."
              checked={settings.show_resume_download}
              onChange={(v) => set('show_resume_download', v)}
              disabled={!settings.profile_public}
            />
          </div>
        </div>

        <div className="h-px bg-[#E5E7EB] dark:bg-[#334155]" />

        {/* Social Links */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-4">Social Links</p>
          <div className="space-y-5">
            <SocialField
              label="LinkedIn"
              placeholder="linkedin.com/in/your-name"
              value={settings.linkedin_url}
              error={linkedinError}
              show={settings.show_linkedin}
              disabled={!settings.profile_public}
              onChangeUrl={(v) => set('linkedin_url', v)}
              onChangeShow={(v) => set('show_linkedin', v)}
            />
            <SocialField
              label="X / Twitter"
              placeholder="x.com/your-handle"
              value={settings.x_url}
              error={xError}
              show={settings.show_x}
              disabled={!settings.profile_public}
              onChangeUrl={(v) => set('x_url', v)}
              onChangeShow={(v) => set('show_x', v)}
            />
            <SocialField
              label="Facebook"
              placeholder="facebook.com/your-profile"
              value={settings.facebook_url}
              error={facebookError}
              show={settings.show_facebook}
              disabled={!settings.profile_public}
              onChangeUrl={(v) => set('facebook_url', v)}
              onChangeShow={(v) => set('show_facebook', v)}
            />
          </div>
        </div>

        <div className="h-px bg-[#E5E7EB] dark:bg-[#334155]" />

        {/* Status */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500 mb-3">Status</p>
          <Toggle
            label="Open to opportunities"
            description='Shows a green "Open to opportunities" badge on your profile.'
            checked={settings.open_to_opportunities}
            onChange={(v) => set('open_to_opportunities', v)}
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0F172A] dark:bg-[#2563EB] text-white text-[13px] font-bold hover:bg-[#1E293B] dark:hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
          ) : (
            <><Check className="w-3.5 h-3.5" />Save changes</>
          )}
        </button>

      </div>
    </div>
  )
}
