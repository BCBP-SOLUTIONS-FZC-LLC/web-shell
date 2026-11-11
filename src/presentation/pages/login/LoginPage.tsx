import { useEffect, useRef, useState } from 'react'
import { useEmailSignIn, type LoginPageProps } from './useEmailSignIn'
import { BrandLogo } from '../../components/BrandLogo'
import { usePrefersReducedMotion } from '../../components/usePrefersReducedMotion'
import logo from '../../../shared/ui/assets/images/logo.png'
import image1 from '../../../shared/ui/assets/images/image1.jpg'
import image2 from '../../../shared/ui/assets/images/image2.jpg'
import image3 from '../../../shared/ui/assets/images/image3.jpg'
import image4 from '../../../shared/ui/assets/images/image4.jpg'
import image5 from '../../../shared/ui/assets/images/image5.jpg'
import image6 from '../../../shared/ui/assets/images/image6.jpg'
import image7 from '../../../shared/ui/assets/images/image7.jpg'
import image8 from '../../../shared/ui/assets/images/image8.jpg'
import image9 from '../../../shared/ui/assets/images/image9.jpg'
import { ForgotPasswordButton, HelpLink, LegalFooter } from '../../components/PageLinks'
import { useShellText, type ShellKey } from '../../../shared/i18n'

const FEATURES = [
  { dotClass: 'bg-[#ff2d9a]', label: 'login.feature.forecasting' },
  { dotClass: 'bg-orange-500', label: 'login.feature.monitoring' },
  { dotClass: 'bg-green-500', label: 'login.feature.safety' },
] as const satisfies readonly { dotClass: string; label: ShellKey }[]

/** Titles may hold a line break (\n); each line renders on its own. */
const SLIDES = [
  { image: image1, title: 'login.slide.1.title', body: 'login.slide.1.body' },
  { image: image2, title: 'login.slide.2.title', body: 'login.slide.2.body' },
  { image: image3, title: 'login.slide.3.title', body: 'login.slide.3.body' },
  { image: image4, title: 'login.slide.4.title', body: 'login.slide.4.body' },
  { image: image5, title: 'login.slide.5.title', body: 'login.slide.5.body' },
  { image: image6, title: 'login.slide.6.title', body: 'login.slide.6.body' },
  { image: image7, title: 'login.slide.7.title', body: 'login.slide.7.body' },
  { image: image8, title: 'login.slide.8.title', body: 'login.slide.8.body' },
  { image: image9, title: 'login.slide.9.title', body: 'login.slide.9.body' },
] as const satisfies readonly { image: string; title: ShellKey; body: ShellKey }[]

/** How long each slide holds before the next; the crossfade takes FADE_MS of it (index.css, hero-kb). */
const SLIDE_MS = 7000
const FADE_MS = 1400
/** Wall-clock time for the slide timer (faked by the test clocks). */
const now = () => Date.now()

/** Each photograph drifts toward its own point while it slowly zooms (the Ken Burns move, hero-kb). */
const DRIFT = ['origin-[30%_40%]', 'origin-[70%_35%]', 'origin-[50%_72%]', 'origin-[24%_66%]'] as const

/** The hero's one-time opening (index.css, cine-*): on until the first slide change. */
const rise = (opening: boolean, delay: 'cine-d1' | 'cine-d2' | 'cine-d3') => (opening ? ` cine-rise ${delay}` : '')
/** A slide's words: the opening's timing on the first slide, then a quick rise on every change. */
const copyRise = (opening: boolean, delay: 'cine-d1' | 'cine-d2') =>
  opening ? ` cine-rise ${delay}` : ` cine-rise${delay === 'cine-d2' ? ' hero-copy-late' : ''}`

export default function LoginPage({ onContinue, onForgotPassword, rememberedEmail, notice = null }: LoginPageProps) {
  const { email, setEmail, remember, setRemember, submitting, error, handleSubmit, handleForgotPassword } =
    useEmailSignIn(onContinue, rememberedEmail, onForgotPassword)
  const text = useShellText()
  const linkClass = 'font-medium text-[#6d5efc] no-underline hover:underline'
  const [slide, setSlide] = useState(0)
  const [settledSlide, setSettledSlide] = useState(0)
  const [loadedSlides, setLoadedSlides] = useState<ReadonlySet<number>>(() => new Set())
  const reduced = usePrefersReducedMotion()
  // The opening plays once: never under reduced motion, and never again once it has ended.
  const [opening, setOpening] = useState(true)
  if (reduced && opening) setOpening(false)
  // The first photograph's zoom waits for the opening, and keeps that delay until it leaves the
  // screen (dropping it mid-zoom would make the photograph jump).
  const [firstLap, setFirstLap] = useState(true)
  // The slideshow moves on its own. Pause (WCAG 2.2.2), a mouse over the hero or keyboard focus in
  // it holds it (a touch does not: a tap fires mouseenter with no leave); reduced motion stops it.
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const held = paused || hovered || focused
  // Time left on this slide, kept across a hold: a hold delays the change, it never restarts it.
  const remaining = useRef(SLIDE_MS)
  // The change came due while the next photograph was not ready: it waits for that photograph,
  // so the words never move ahead of their picture.
  const due = useRef(false)
  const loadedRef = useRef(loadedSlides)
  const stillRef = useRef(held || reduced)
  const nextIndex = (slide + 1) % SLIDES.length
  const nextRef = useRef(nextIndex)
  useEffect(() => {
    loadedRef.current = loadedSlides
    stillRef.current = held || reduced
    nextRef.current = nextIndex
  })

  function advance() {
    due.current = false
    remaining.current = SLIDE_MS
    setOpening(false)
    setSlide((current) => (current + 1) % SLIDES.length)
  }

  function markSlideLoaded(index: number) {
    setLoadedSlides((current) => {
      if (current.has(index)) return current
      const next = new Set(current)
      next.add(index)
      return next
    })
    if (due.current && index === nextRef.current && !stillRef.current) advance()
  }

  useEffect(() => {
    if (reduced || held) return
    const started = now()
    let fired = false
    const timer = window.setTimeout(() => {
      fired = true
      remaining.current = 0
      if (loadedRef.current.has(nextRef.current)) advance()
      else due.current = true
    }, remaining.current)
    return () => {
      window.clearTimeout(timer)
      // A hold keeps the time left. A timer that fired has nothing left to keep, and advance()
      // has already given the new slide its full time.
      if (!fired) remaining.current = Math.max(0, remaining.current - (now() - started))
    }
  }, [reduced, held, slide])

  // Once the incoming photograph has faded in over the last one, it becomes the base.
  useEffect(() => {
    if (!loadedSlides.has(slide) || slide === settledSlide) return
    const timer = window.setTimeout(() => {
      setSettledSlide(slide)
      setFirstLap(false)
    }, FADE_MS)
    return () => window.clearTimeout(timer)
  }, [slide, loadedSlides, settledSlide])

  const activeSlide = SLIDES[slide]!

  return (
    <div className="flex min-h-dvh flex-col bg-[#061018] font-sans lg:flex-row">
      <section
        className={`relative z-0 min-h-[68vh] flex-1 overflow-hidden lg:min-h-dvh${held ? ' hero-held' : ''}`}
        aria-roledescription={text('login.carousel.role')}
        aria-label={text('login.carousel')}
        onPointerEnter={(event) => setHovered(event.pointerType === 'mouse')}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
        }}
      >
        {SLIDES.map((item, index) => {
          const visible = index === settledSlide || (index === slide && loadedSlides.has(index))
          const first = index === 0 && opening
          const late = index === 0 && firstLap
          // Fetch only the slides on screen and the next one; a loaded image keeps its src.
          const wanted =
            index === settledSlide || index === slide || index === (slide + 1) % SLIDES.length || loadedSlides.has(index)
          return (
            // The frame crossfades; the photograph inside zooms and drifts while it is on screen.
            <div
              key={item.image}
              className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-[1400ms] ease-in-out motion-reduce:transition-none ${
                index === slide ? 'z-[1]' : 'z-0'
              } ${visible ? 'opacity-100' : 'opacity-0'}${first ? ' cine-settle' : ''}`}
              aria-hidden
            >
              <img
                src={wanted ? item.image : undefined}
                alt=""
                decoding="async"
                draggable={false}
                onLoad={(event) => {
                  if (event.currentTarget.naturalWidth > 0) markSlideLoaded(index)
                }}
                ref={(node) => {
                  if (node?.getAttribute('src') && node.complete && node.naturalWidth > 0) markSlideLoaded(index)
                }}
                className={`h-full w-full object-cover ${DRIFT[index % DRIFT.length]}${
                  visible ? ` hero-kb${late ? ' hero-kb-late' : ''}` : ''
                }`}
              />
            </div>
          )
        })}
        {/* Film grade: a teal-black wash, the light leak, grain, then the letterbox bars (all still after 2.4 s). */}
        <div
          className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgb(6_16_24/0.35)_0%,rgb(6_16_24/0.15)_25%,rgb(6_16_24/0.7)_50%,rgb(6_16_24/0.92)_100%)]"
          aria-hidden
        />
        <div className="cine-leak pointer-events-none absolute inset-0 z-[3]" aria-hidden />
        <div className="cine-grain pointer-events-none absolute z-[3]" aria-hidden />
        {opening ? (
          <>
            <div className="cine-bar pointer-events-none absolute inset-x-0 top-0 z-[4] bg-black" aria-hidden />
            <div className="cine-bar cine-bar-bottom pointer-events-none absolute inset-x-0 bottom-0 z-[4] bg-black" aria-hidden />
          </>
        ) : null}
        <div className="relative z-10 flex min-h-[68vh] flex-col justify-end px-8 pb-12 pt-16 sm:px-12 lg:min-h-dvh lg:px-16 lg:pb-16 xl:px-20">
          <div className={rise(opening, 'cine-d1')}>
            <BrandLogo size={72} />
            {/* The brand name as logotype: exempt from text contrast (WCAG 1.4.3), as in the form panel. */}
            <p className="mt-6 text-[0.85rem] font-bold uppercase tracking-[0.24em] text-[#ff2d9a]" data-logotype>
              BCBP SOLUTIONS
            </p>
          </div>
          {/* Each slide is a named group; the slideshow is not a live region (it changes on its own). */}
          <div>
            <div
              key={slide}
              role="group"
              aria-roledescription={text('login.carousel.slideRole')}
              aria-label={text('login.carousel.slide', { number: slide + 1, total: SLIDES.length })}
            >
              <h1
                className={`mt-4 max-w-[24em] text-balance text-[clamp(2rem,3.1vw,3.4rem)] font-[650] leading-[1.05] tracking-[-0.02em] text-white${copyRise(opening, 'cine-d1')}`}
              >
                {text(activeSlide.title).split('\n').map((line, index) => (
                  <span key={line}>
                    {index > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
              </h1>
              <p
                className={`mt-5 max-w-[36rem] text-[clamp(1rem,1.3vw,1.2rem)] leading-relaxed text-white/80${copyRise(opening, 'cine-d2')}`}
              >
                {text(activeSlide.body)}
              </p>
            </div>
          </div>
          <ul className={`mt-8 flex list-none flex-wrap gap-2.5 p-0${rise(opening, 'cine-d3')}`}>
            {FEATURES.map(({ dotClass, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3.5 py-2 text-[clamp(0.7rem,1vw,0.85rem)] font-medium text-white"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                {text(label)}
              </li>
            ))}
          </ul>
          {/* The one control: the slideshow's pause. Not part of the rise, so it is never invisible. */}
          {reduced ? null : (
            <button
              type="button"
              // The name says what a press does (Pause / Play), so no aria-pressed as well.
              onClick={() => setPaused((p) => !p)}
              className="mt-8 inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-white/25 bg-black/40 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black/60"
            >
              <span aria-hidden>{paused ? '▶' : '❚❚'}</span>
              {text(paused ? 'login.carousel.play' : 'login.carousel.pause')}
            </button>
          )}
        </div>
      </section>

      <aside className="relative z-20 flex w-full shrink-0 flex-col bg-white text-gray-900 lg:w-[min(100%,30rem)] lg:shadow-[-16px_0_40px_rgba(6,16,24,0.18)] xl:w-[34rem]">
        <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-12">
          <div className="mb-10 flex items-center gap-3">
            <img
              src={logo}
              alt=""
              aria-hidden
              width={64}
              height={64}
              className="h-16 w-16 object-contain mix-blend-multiply"
            />
            {/* The brand logotype: exempt from text contrast (WCAG 1.4.3), so its pink stays the brand's. */}
            <div className="leading-none" data-logotype>
              <p className="text-[1.65rem] font-extrabold tracking-wide text-[#1a1a2e]">BCBP</p>
              <p className="mt-1 text-sm font-semibold tracking-[0.28em] text-[#ff2d9a]">SOLUTIONS</p>
            </div>
          </div>

          <h2 className="m-0 text-lg font-semibold text-[#1a1a2e]">{text('login.heading')}</h2>

          <form className="mt-8" onSubmit={handleSubmit}>
            {notice ? (
              <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {text(notice)}
              </p>
            ) : null}
            {error ? (
              <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <p>{error}</p>
              </div>
            ) : null}
            <label className="mb-5 block">
              <span className="mb-2 block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-gray-500">
                {text('login.email')}
              </span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="box-border w-full rounded-md border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition-[border-color,box-shadow] focus:border-[#ff2d9a] focus:shadow-[0_0_0_3px_rgba(255,45,154,0.12)]"
              />
            </label>
            <label className="mb-6 inline-flex cursor-pointer select-none items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-[#ff2d9a]"
              />
              <span>{text('login.remember')}</span>
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full cursor-pointer rounded-lg border-0 bg-[linear-gradient(90deg,#ff4fa3_0%,#8b5cf6_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(139,92,246,0.35)] transition-[filter,transform] hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? text('login.redirecting') : text('login.continue')}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-4 text-sm">
            <ForgotPasswordButton
              onClick={handleForgotPassword}
              disabled={submitting}
              className={`text-sm ${linkClass}`}
            />
            <HelpLink className={linkClass} />
          </div>
        </div>

        <LegalFooter
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-8 pb-6 text-[0.7rem] text-gray-400"
          linkClassName="no-underline hover:underline"
        />
      </aside>
    </div>
  )
}
