// The first-visit welcome, before the sign-in page: a blueprint grid, site dust drifting on a canvas,
// the brand name tracking wider, a glass card whose product facts count up, and one call to action.
// It only renders and reports: `onComplete` runs on Continue, Skip or Escape, and the caller
// remembers it (WelcomeIntroRepository). Every loop it starts (canvas frames, count-up, listeners)
// stops on unmount, so nothing outlives the screen when the sign-in page replaces it.
//
//   0–1.4 s  BCBP SOLUTIONS fades in and tracks wider   0.5 s headline   1.0 s subline
//   1.2 s    the glass card drops in; its facts count up from 2.0 s for 1.2 s
//   1.8 s    the call to action, then its glow pulses (held, with the dust, by "Pause animation")
// Under prefers-reduced-motion: the final frame, no canvas loop, no count-up, no glow.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { BrandLogo } from '../../components/BrandLogo'
import { useShellText, type ShellKey } from '../../../shared/i18n'

export interface WelcomeSplashProps {
  /** Continue, Skip intro or Escape: the caller remembers the intro as seen and shows the sign-in page. */
  onComplete: () => void
}

type Fact = { count: number; suffix: string; label: ShellKey } | { word: ShellKey; label: ShellKey }

/** Facts the product already states (the sign-in page's highlights and its programme slides); no live data. */
const FACTS: readonly Fact[] = [
  { count: 95, suffix: '%', label: 'welcome.fact.forecasting' },
  { count: 8, suffix: '', label: 'welcome.fact.sectors' },
  { word: 'welcome.fact.monitoring.value', label: 'welcome.fact.monitoring' },
]

const COUNT_DELAY_MS = 2000
const COUNT_MS = 1200

const REDUCE = '(prefers-reduced-motion: reduce)'
const hasMatchMedia = () => typeof window.matchMedia === 'function'

function subscribeReducedMotion(changed: () => void): () => void {
  const query = hasMatchMedia() ? window.matchMedia(REDUCE) : undefined
  query?.addEventListener?.('change', changed)
  return () => query?.removeEventListener?.('change', changed)
}

const reducedMotionNow = () => hasMatchMedia() && window.matchMedia(REDUCE).matches

/** The reduced-motion preference, followed live (turning it on mid-intro stops the motion). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionNow)
}

/** `target`, counted up from 0 with an ease-out after `delay`; at once when `still`. */
function useCountUp(target: number, still: boolean): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (still) return
    let frame = 0
    let start: number | undefined
    const step = (now: number) => {
      start ??= now + COUNT_DELAY_MS
      const t = Math.min(1, Math.max(0, (now - start) / COUNT_MS))
      // Nothing to set while waiting for the card to land.
      if (t > 0) setValue(Math.round(target * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, still])
  return still ? target : value
}

function FactValue({ fact, still }: { fact: Fact; still: boolean }) {
  const text = useShellText()
  const counted = useCountUp('count' in fact ? fact.count : 0, still || !('count' in fact))
  if (!('count' in fact)) return <>{text(fact.word)}</>
  return (
    <>
      {/* Screen readers get the final value once; the counting digits are for the eye only. */}
      <span aria-hidden>
        {counted}
        {fact.suffix}
      </span>
      <span className="sr-only">
        {fact.count}
        {fact.suffix}
      </span>
    </>
  )
}

interface Mote {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  alpha: number
  amber: boolean
}

/**
 * Slow site dust and sparks rising on `el` until the returned stop() is called: one frame loop,
 * paused while the tab is hidden; stop() cancels it and removes every listener. `motes` is kept by
 * the caller, so a pause and resume continue the same dust; a resize scatters it anew.
 */
function startSiteDust(el: HTMLCanvasElement, kept: { motes: Mote[] }): () => void {
  const ctx = el.getContext('2d')
  if (!ctx) return () => {}
  let width = 0
  let height = 0
  const size = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    width = el.clientWidth
    height = el.clientHeight
    el.width = Math.round(width * ratio)
    el.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  const scatter = () => {
    const count = Math.max(30, Math.min(90, Math.round((width * height) / 16000)))
    kept.motes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.6 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -(0.05 + Math.random() * 0.2),
      alpha: 0.15 + Math.random() * 0.5,
      amber: Math.random() < 0.35,
    }))
  }
  const resize = () => {
    size()
    scatter()
  }
  let frame = 0
  const draw = () => {
    ctx.clearRect(0, 0, width, height)
    for (const m of kept.motes) {
      m.x += m.vx
      m.y += m.vy
      if (m.y < -4) {
        m.y = height + 4
        m.x = Math.random() * width
      }
      ctx.beginPath()
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2)
      ctx.fillStyle = m.amber ? `rgba(255, 184, 0, ${m.alpha})` : `rgba(203, 213, 225, ${m.alpha * 0.6})`
      ctx.fill()
    }
    frame = requestAnimationFrame(draw)
  }
  const onVisibility = () => {
    cancelAnimationFrame(frame)
    if (document.visibilityState === 'visible') frame = requestAnimationFrame(draw)
  }
  size()
  if (kept.motes.length === 0) scatter()
  frame = requestAnimationFrame(draw)
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

export default function WelcomeSplash({ onComplete }: WelcomeSplashProps) {
  const text = useShellText()
  const reduced = usePrefersReducedMotion()
  const [paused, setPaused] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const dust = useRef<{ motes: Mote[] }>({ motes: [] })

  // The dust runs while the splash is on screen and not paused; unmount or pause stops its loop.
  useEffect(() => {
    if (reduced || paused || !canvas.current) return
    return startSiteDust(canvas.current, dust.current)
  }, [reduced, paused])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onComplete()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onComplete])

  return (
    <div
      // The amber primary for the daisyUI button, scoped to the splash (whole class names, so Tailwind finds them).
      className={`${paused ? 'splash-paused ' : ''}relative flex min-h-dvh flex-col overflow-hidden bg-[#0a0d12] font-sans text-white [--color-primary:#ffb800] [--color-primary-content:#1a1300]`}
    >
      <div className="blueprint-grid pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgb(255_184_0/0.08),transparent_60%)]"
        aria-hidden
      />
      {reduced ? null : <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />}

      <header className="relative z-10 flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <BrandLogo size={44} />
        <div className="flex items-center gap-2">
          {reduced ? null : (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-slate-300 hover:text-white"
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
            >
              {text(paused ? 'welcome.play' : 'welcome.pause')}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm text-slate-300 hover:text-white" onClick={onComplete}>
            {text('welcome.skip')}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 pb-16 text-center sm:px-10">
        <p className="splash-track m-0 text-[clamp(0.9rem,1.6vw,1.2rem)] font-bold uppercase text-[#ffb800]" data-logotype>
          BCBP SOLUTIONS
        </p>
        <h1 className="cine-rise cine-d1 mt-6 max-w-[20em] text-balance text-[clamp(2.1rem,4.4vw,4rem)] font-[650] leading-[1.05] tracking-[-0.02em]">
          {text('welcome.title')}
        </h1>
        <p className="cine-rise cine-d2 mt-5 max-w-[38rem] text-[clamp(1rem,1.4vw,1.2rem)] leading-relaxed text-slate-300">
          {text('welcome.subtitle')}
        </p>

        <section
          aria-label={text('welcome.facts')}
          className="glass splash-drop mt-12 w-full max-w-3xl rounded-2xl border border-white/10 [--glass-blur:14px] [--glass-opacity:6%] [--glass-reflect-opacity:0%]"
        >
          <dl className="m-0 grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {FACTS.map((fact) => (
              <div key={fact.label} className="flex flex-col-reverse items-center gap-1 px-6 py-6">
                <dt className="text-sm text-slate-300">{text(fact.label)}</dt>
                <dd className="m-0 text-[clamp(2rem,3.2vw,2.75rem)] font-bold tabular-nums tracking-tight text-white">
                  <FactValue fact={fact} still={reduced} />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <button type="button" className="btn btn-primary btn-lg cta-glow mt-12 rounded-full px-10" onClick={onComplete}>
          {text('welcome.continue')}
          <span aria-hidden>→</span>
        </button>
      </main>
    </div>
  )
}
