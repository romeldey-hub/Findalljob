import { useState, useEffect } from 'react'

// Counts from `from` → target using cubic ease-out via requestAnimationFrame.
// Respects prefers-reduced-motion — returns target immediately if set.
export function useCountUp(target: number, duration = 900, delay = 0, from = 0): number {
  const [value, setValue] = useState(from)

  useEffect(() => {
    setValue(from)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const t = setTimeout(() => setValue(target), 0)
      return () => clearTimeout(t)
    }

    let raf: number
    const startAt = performance.now() + delay

    const tick = (now: number) => {
      if (now < startAt) { raf = requestAnimationFrame(tick); return }
      const t      = Math.min((now - startAt) / duration, 1)
      const eased  = 1 - Math.pow(1 - t, 3) // cubic ease-out
      setValue(Math.round(from + eased * (target - from)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, delay, from])

  return value
}

// Flips to true after `delay` ms, used to trigger CSS transitions on mount.
export function useAnimate(delay = 80): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const t = setTimeout(() => setReady(true), 0)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setReady(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return ready
}
