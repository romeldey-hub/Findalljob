import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function toDataUri(url: string): Promise<string | null> {
  // Already a data URI — nothing to do
  if (url.startsWith('data:')) return url
  try {
    // Proxy through our own API to avoid CORS restrictions on external avatar CDNs
    const proxyUrl = `/api/proxy-avatar?url=${encodeURIComponent(url)}`
    const res = await fetch(proxyUrl)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>(resolve => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
