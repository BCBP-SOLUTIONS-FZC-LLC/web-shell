import { useEffect, useState } from 'react'
import { useEmailSignIn, type LoginPageProps } from './useEmailSignIn'
import { BrandLogo } from '../components/BrandLogo'
import logo from '../assets/images/logo.png'
import image1 from '../assets/images/image1.jpg'
import image2 from '../assets/images/image2.jpg'
import image3 from '../assets/images/image3.jpg'
import image4 from '../assets/images/image4.jpg'
import image5 from '../assets/images/image5.jpg'
import image6 from '../assets/images/image6.jpg'
import image7 from '../assets/images/image7.jpg'
import image8 from '../assets/images/image8.jpg'
import image9 from '../assets/images/image9.jpg'
import { ForgotPasswordButton, HelpLink, LegalFooter } from './PageLinks'
import { useShellText, type ShellKey } from '../shared/i18n'

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

const SLIDE_MS = 6000

export default function LoginPage({ onContinue, onForgotPassword, rememberedEmail, notice = null }: LoginPageProps) {
  const { email, setEmail, remember, setRemember, submitting, error, handleSubmit, handleForgotPassword } =
    useEmailSignIn(onContinue, rememberedEmail, onForgotPassword)
  const text = useShellText()
  const linkClass = 'font-medium text-[#6d5efc] no-underline hover:underline'
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
        aria-roledescription={text('login.carousel.role')}
        aria-label={text('login.carousel')}
        onMouseEnter={() => setSlidePaused(true)}
        onMouseLeave={() => setSlidePaused(false)}
      >
        {SLIDES.map((item, index) => {
          const isIncoming = index === slide && index !== settledSlide && loadedSlides.has(index)
          const isBase = index === settledSlide
          // Fetch only the slides on screen and the next one; a loaded image keeps its src.
          const wanted =
            index === settledSlide || index === slide || index === (slide + 1) % SLIDES.length || loadedSlides.has(index)
          return (
            <img
              key={item.image}
              src={wanted ? item.image : undefined}
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
              {text(activeSlide.title).split('\n').map((line, index) => (
                <span key={line}>
                  {index > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </h1>
            <p className="mt-5 max-w-[36rem] text-[clamp(0.95rem,1.4vw,1.15rem)] leading-relaxed text-white/90">
              {text(activeSlide.body)}
            </p>
          </div>
          <ul className="mt-8 flex list-none flex-wrap gap-2.5">
            {FEATURES.map(({ dotClass, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1a1030]/80 px-3.5 py-2 text-[clamp(0.7rem,1vw,0.85rem)] font-medium text-white"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                {text(label)}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/30 bg-black/30 text-lg text-white"
              aria-label={text('login.carousel.previous')}
              onClick={() => showSlide(slide - 1)}
            >
              ‹
            </button>
            <div className="flex items-center gap-2">
              {SLIDES.map((item, index) => (
                <button
                  key={item.image}
                  type="button"
                  aria-label={text('login.carousel.show', { number: index + 1 })}
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
              aria-label={text('login.carousel.next')}
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
