import { useState, useEffect } from 'react'

// Counts from 0 → target using cubic ease-out via requestAnimationFrame.
// Respects prefers-reduced-motion — returns target immediately if set.
export function useCountUp(target: number, duration = 900, delay = 0): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }

    let raf: number
    const startAt = performance.now() + delay

    const tick = (now: number) => {
      if (now < startAt) { raf = requestAnimationFrame(tick); return }
      const t      = Math.min((now - startAt) / duration, 1)
      const eased  = 1 - Math.pow(1 - t, 3) // cubic ease-out
      setValue(Math.round(eased * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, delay])

  return value
}

// Flips to true after `delay` ms, used to trigger CSS transitions on mount.
export function useAnimate(delay = 80): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReady(true)
      return
    }
    const t = setTimeout(() => setReady(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return ready
}
