import { useEffect, useState } from 'react'
import { useEmailSignIn, type LoginPageProps } from './useEmailSignIn'
import { BrandLogo } from '../components/BrandLogo'

const FEATURES = [
  { dotClass: 'bg-[#ff2d9a]', label: '95% Accuracy Forecasting' },
  { dotClass: 'bg-orange-500', label: 'Real-time Site Monitoring' },
  { dotClass: 'bg-green-500', label: 'Safety & Compliance' },
] as const

const SLIDES = [
  {
    image: '/image/image1.jpg',
    title: ['Next-Gen System, Built for You.', 'Supercharged and Limitless.'],
    body: 'Access your unified workspace with automated governance, low-latency telemetry, and institutional-grade access controls.',
  },
  {
    image: '/image/image2.jpg',
    title: ['Airside programs, held to the plan.'],
    body: 'Coordinate gates, works, and contractors from one workspace while the apron stays in motion.',
  },
  {
    image: '/image/image3.jpg',
    title: ['Port calls, coordinated end to end.'],
    body: 'Track berth work, cargo, and contractors together so the quay stays on schedule.',
  },
  {
    image: '/image/image4.jpg',
    title: ['Road corridors, delivered on grade.'],
    body: 'Keep earthworks, paving, and lane closures aligned so every kilometer stays on the critical path.',
  },
  {
    image: '/image/image5.jpg',
    title: ['Bridge spans, raised with precision.'],
    body: 'Orchestrate foundations, decks, and lifting windows so each span lands safely and on time.',
  },
  {
    image: '/image/image6.jpg',
    title: ['High-voltage lines, laid with care.'],
    body: 'Plan stringing, clearances, and outages in one view so transmission work stays energized and safe.',
  },
  {
    image: '/image/image7.jpg',
    title: ['Refinery builds, sequenced to startup.'],
    body: 'Align modules, turnarounds, and commissioning so process units reach mechanical completion together.',
  },
  {
    image: '/image/image8.jpg',
    title: ['Chemical plants, built to operate.'],
    body: 'Coordinate piping, utilities, and HSE gates so every unit is ready when production begins.',
  },
  {
    image: '/image/image9.jpg',
    title: ['Village programs, built for people.'],
    body: 'Track housing, water, and civic works together so communities see progress that lasts.',
  },
] as const

const SLIDE_MS = 6000

export default function LoginPage({ onContinue, notice = null }: LoginPageProps) {
  const { email, setEmail, remember, setRemember, submitting, error, handleSubmit } =
    useEmailSignIn(onContinue)
  const [slide, setSlide] = useState(0)
  const [settledSlide, setSettledSlide] = useState(0)
  const [loadedSlides, setLoadedSlides] = useState<ReadonlySet<number>>(() => new Set())
  const [slidePaused, setSlidePaused] = useState(false)
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1)

  function markSlideLoaded(index: number) {
    setLoadedSlides((current) => {
      if (current.has(index)) return current
      const next = new Set(current)
      next.add(index)
      return next
    })
  }

  useEffect(() => {
    if (!loadedSlides.has(slide) || slide === settledSlide) return
    const timer = window.setTimeout(() => setSettledSlide(slide), 900)
    return () => window.clearTimeout(timer)
  }, [slide, loadedSlides, settledSlide])

  useEffect(() => {
    if (slidePaused) {
      return
    }
    const timer = window.setInterval(() => {
      setSlideDirection(1)
      setSlide((current) => (current + 1) % SLIDES.length)
    }, SLIDE_MS)
    return () => window.clearInterval(timer)
  }, [slidePaused])

  function showSlide(next: number) {
    const count = SLIDES.length
    const normalized = ((next % count) + count) % count
    if (normalized === slide) {
      return
    }
    const forward = (normalized - slide + count) % count
    const backward = (slide - normalized + count) % count
    setSlideDirection(forward <= backward ? 1 : -1)
    setSlide(normalized)
  }

  const activeSlide = SLIDES[slide]!
  const heroShift = slideDirection === 1 ? '4%' : '-4%'

  return (
    <div className="flex min-h-dvh flex-col bg-[#061018] font-sans lg:flex-row">
      <section
        className="relative z-0 min-h-[68vh] flex-1 overflow-hidden lg:min-h-dvh"
        aria-roledescription="carousel"
        aria-label="Product highlights"
        onMouseEnter={() => setSlidePaused(true)}
        onMouseLeave={() => setSlidePaused(false)}
      >
        {SLIDES.map((item, index) => {
          const isIncoming = index === slide && index !== settledSlide && loadedSlides.has(index)
          const isBase = index === settledSlide
          return (
            <img
              key={item.image}
              src={item.image}
              alt=""
              decoding="async"
              draggable={false}
              onLoad={(event) => {
                if (event.currentTarget.naturalWidth > 0) markSlideLoaded(index)
              }}
              ref={(node) => {
                if (node?.complete && node.naturalWidth > 0) markSlideLoaded(index)
              }}
              className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
                isIncoming ? 'z-[1] hero-image-in' : isBase ? 'z-0 opacity-100' : 'z-0 opacity-0'
              }`}
              style={isIncoming ? { ['--hero-shift' as string]: heroShift } : undefined}
              aria-hidden
            />
          )
        })}
        <div
          className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/55 via-black/15 to-transparent"
          aria-hidden
        />
        <div className="relative z-10 flex min-h-[68vh] flex-col justify-end px-8 pb-12 pt-16 sm:px-12 lg:min-h-dvh lg:px-16 lg:pb-16 xl:px-20">
          <BrandLogo size={84} />
          <p className="mt-8 text-[clamp(1.75rem,3vw,2.6rem)] font-extrabold tracking-[0.08em] text-[#ff2d9a]">
            BCBP SOLUTIONS
          </p>
          <div
            key={slide}
            className="hero-copy-in"
            style={{ ['--hero-shift' as string]: slideDirection === 1 ? '1.5rem' : '-1.5rem' }}
          >
            <h1 className="mt-4 max-w-[22em] text-[clamp(1.85rem,2.7vw,3rem)] font-bold leading-[1.12] tracking-tight text-white">
              {activeSlide.title.map((line, index) => (
                <span key={line}>
                  {index > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </h1>
            <p className="mt-5 max-w-[36rem] text-[clamp(0.95rem,1.4vw,1.15rem)] leading-relaxed text-white/90">
              {activeSlide.body}
            </p>
          </div>
          <ul className="mt-8 flex list-none flex-wrap gap-2.5">
            {FEATURES.map(({ dotClass, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1a1030]/80 px-3.5 py-2 text-[clamp(0.7rem,1vw,0.85rem)] font-medium text-white"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                {label}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/30 bg-black/30 text-lg text-white"
              aria-label="Previous slide"
              onClick={() => showSlide(slide - 1)}
            >
              ‹
            </button>
            <div className="flex items-center gap-2">
              {SLIDES.map((item, index) => (
                <button
                  key={item.image}
                  type="button"
                  aria-label={`Show slide ${index + 1}`}
                  aria-current={index === slide ? 'true' : undefined}
                  onClick={() => showSlide(index)}
                  className={`h-2.5 cursor-pointer rounded-full transition-all ${
                    index === slide ? 'w-7 bg-[#ff2d9a]' : 'w-2.5 bg-white/70'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/30 bg-black/30 text-lg text-white"
              aria-label="Next slide"
              onClick={() => showSlide(slide + 1)}
            >
              ›
            </button>
          </div>
        </div>
      </section>

      <aside className="relative z-20 flex w-full shrink-0 flex-col bg-white text-gray-900 lg:w-[min(100%,30rem)] lg:shadow-[-16px_0_40px_rgba(6,16,24,0.18)] xl:w-[34rem]">
        <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-12">
          <div className="mb-10 flex items-center gap-3">
            <img
              src="/image/logo.png"
              alt=""
              aria-hidden
              width={64}
              height={64}
              className="h-16 w-16 object-contain mix-blend-multiply"
            />
            <div className="leading-none">
              <p className="text-[1.65rem] font-extrabold tracking-wide text-[#1a1a2e]">BCBP</p>
              <p className="mt-1 text-sm font-semibold tracking-[0.28em] text-[#ff2d9a]">SOLUTIONS</p>
            </div>
          </div>

          <h2 className="m-0 text-lg font-semibold text-[#1a1a2e]">Login to your account</h2>

          <form className="mt-8" onSubmit={handleSubmit}>
            {notice ? (
              <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {notice}
              </p>
            ) : null}
            {error ? (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <p>{error}</p>
              </div>
            ) : null}
            <label className="mb-5 block">
              <span className="mb-2 block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-gray-500">
                Work email address
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
              <span>Remember Email</span>
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full cursor-pointer rounded-lg border-0 bg-[linear-gradient(90deg,#ff4fa3_0%,#8b5cf6_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(139,92,246,0.35)] transition-[filter,transform] hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? 'Redirecting…' : 'Continue with Email'}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-4 text-sm">
            <a href="#forgot" className="font-medium text-[#6d5efc] no-underline hover:underline">
              Forgot your password?
            </a>
            <span className="h-4 w-px bg-gray-200" aria-hidden />
            <a href="#help" className="font-medium text-[#6d5efc] no-underline hover:underline">
              Trouble logging in?
            </a>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-8 pb-6 text-[0.7rem] text-gray-400">
          <a href="#privacy" className="no-underline hover:underline">
            Privacy Policy
          </a>
          <a href="#terms" className="no-underline hover:underline">
            Terms of Service
          </a>
          <a href="#trust" className="no-underline hover:underline">
            Trust &amp; Security
          </a>
        </footer>
      </aside>
    </div>
  )
}
