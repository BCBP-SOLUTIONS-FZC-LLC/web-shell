/** Previous login layout. Switch back to this screen with `ACTIVE_LOGIN = 'login1'`. */
import { useEmailSignIn, type LoginPageProps } from './useEmailSignIn'
import { BrandLogo } from '../components/BrandLogo'

const FEATURES = [
  { dotClass: 'bg-[#ff2d9a]', label: '95% Accuracy Forecasting' },
  { dotClass: 'bg-orange-500', label: 'Real-time Site Monitoring' },
  { dotClass: 'bg-green-500', label: 'Safety & Compliance' },
] as const

/** Left panel — diagonal inner edge (40% top → 35% bottom), mirror of right */
const leftPanelClip = '[clip-path:polygon(0_0,50%_0,60%_100%,0_100%)]' as const

/** Right panel — mirrored diagonal (60% top → 65% bottom) */
const rightPanelClip = '[clip-path:polygon(100%_0,90%_0,100%_100%,100%_100%)]' as const

/** ~20% center band where cityscape shows (40%–60% at top) */
const centerBandClip = '[clip-path:polygon(0%_0,100%_0,100%_100%,0%_100%)]' as const

const leftPanelGlow =
  '[filter:drop-shadow(2px_0_0_rgba(255,60,170,0.95))_drop-shadow(6px_0_18px_rgba(255,45,154,0.55))]' as const

const rightPanelGlow =
  '[filter:drop-shadow(-2px_0_0_rgba(255,60,170,0.95))_drop-shadow(-6px_0_18px_rgba(255,45,154,0.55))]' as const

function PanelLayers({ clip, mirrored = false }: { clip: string; mirrored?: boolean }) {
  return (
    <>
      <div
        className={`absolute inset-0 bg-gradient-to-br from-[#08071e] via-[#121038] to-[#241858] ${clip} max-md:[clip-path:none]`}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,45,154,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,45,154,0.055)_1px,transparent_1px)] bg-[length:40px_40px] [mask-image:linear-gradient(165deg,black_20%,transparent_88%)] ${clip} max-md:[clip-path:none]`}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent from-40% to-[rgba(120,40,160,0.35)] to-100% ${clip} max-md:[clip-path:none] ${mirrored ? 'scale-x-[-1]' : ''}`}
        aria-hidden
      />
    </>
  )
}

export default function LoginPage({ onContinue, notice = null }: LoginPageProps) {
  const { email, setEmail, remember, setRemember, submitting, error, handleSubmit } =
    useEmailSignIn(onContinue)

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#030d1b] font-sans text-white">
      {/* Full-bleed cityscape; center band stays visible between mirrored panels */}
      <div
        className="absolute inset-0 z-0 bg-[url('/image/cityscape.jpg')] bg-cover bg-center bg-no-repeat"
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute inset-0 z-[1] bg-black/15 ${centerBandClip} max-md:[clip-path:none]`}
        aria-hidden
      />

      {/* Left brand panel */}
      <div
        className={`absolute inset-0 z-[2] min-h-dvh ${leftPanelClip} ${leftPanelGlow} max-md:relative max-md:[clip-path:none] max-md:[filter:none]`}
      >
        <PanelLayers clip={leftPanelClip} />
        <div className="relative z-[1] flex min-h-dvh w-full flex-col justify-end px-6 pb-12 pl-8 pr-[10%] sm:pl-12 sm:pb-14 lg:pl-16 max-md:min-h-0 max-md:justify-start max-md:p-6">
          <div className="flex w-full max-w-none flex-col gap-6 pb-2">
            <BrandLogo className="block" size={128} />
            <h1 className="text-[clamp(4.75rem,4.2vw,3.5rem)] font-bold leading-[1.12] tracking-tight">
              <span className="text-[#d81b60]">Beyond </span>
              <span className="text-white">Code,</span>
              <br />
              <span className="text-[#7e57c2]">Best </span>
              <span className="text-white">Possibilities.</span>
            </h1>
            <p className="text-[clamp(3rem,2vw,1.65rem)] font-semibold leading-snug">
              Next-Gen System, Built for You.
              <br />
              Supercharged and Limitless.
            </p>
            <p className="max-w-[min(52rem,95%)] text-[clamp(1.5rem,1.5vw,1.25rem)] leading-relaxed text-white/85">
              Ultimate AI platform for Tender/Project Management automation. Built on latest High-End Technologie
            </p>
            <ul className="flex list-none flex-wrap gap-2.5 pt-2">
              {FEATURES.map(({ dotClass, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-2 rounded-full border border-[#4a3f6b] bg-[#1a1535] px-3.5 py-2 text-[clamp(0.7rem,1vw,0.85rem)] font-medium text-white/90"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Right panel — same diagonal slice, mirrored */}
      <div
        className={`pointer-events-none absolute inset-0 z-[2] min-h-dvh ${rightPanelClip} ${rightPanelGlow} max-md:hidden`}
        aria-hidden
      >
        <PanelLayers clip={rightPanelClip} mirrored />
      </div>

      {/* Login over center 20% cityscape band */}
      <div
        className={`absolute inset-0 z-[4] flex flex-col items-end justify-end px-50 py-24 max-md:relative max-md:min-h-[52vh] ${centerBandClip} max-md:[clip-path:none]`}
      >
        <div className="flex w-full max-w-[420px] flex-col items-center gap-3">
          <div className="w-full shrink-0 rounded-xl bg-white px-7 pb-7 pt-[1.65rem] text-gray-900 shadow-login-card">
            <div className="mb-[1.15rem] flex items-start justify-between gap-3">
              <h2 className="m-0 text-[0.98rem] font-bold text-[#1a1a2e]">Login to your account</h2>
              <a
                href="#help"
                className="mt-0.5 shrink-0 whitespace-nowrap text-[0.68rem] font-medium text-aura-secondary no-underline hover:underline"
              >
                Trouble logging in?
              </a>
            </div>
            <form onSubmit={handleSubmit}>
              {notice ? (
                <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {notice}
                </p>
              ) : null}
              {error ? (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <p>{error}</p>
                </div>
              ) : null}
              <label className="mb-3.5 block">
                <span className="mb-1.5 block text-[0.6rem] font-semibold uppercase tracking-widest text-gray-500">
                  Work email address
                </span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="box-border w-full rounded-md border border-gray-200 bg-white px-2.5 py-2.5 text-sm text-gray-900 outline-none transition-[border-color,box-shadow] focus:border-brand-pink focus:shadow-[0_0_0_3px_rgba(233,30,140,0.12)]"
                />
              </label>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-[0.72rem] text-gray-700">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-3 w-3 cursor-pointer accent-brand-pink"
                  />
                  <span>Remember Email</span>
                </label>
                <a
                  href="#forgot"
                  className="text-[0.72rem] font-medium text-aura-secondary no-underline hover:underline"
                >
                  Forgot your password?
                </a>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full cursor-pointer rounded-lg border-0 bg-[linear-gradient(90deg,#ff2d9a_0%,#7c3aed_55%,#6366f1_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition-[filter,transform,background] hover:bg-[linear-gradient(90deg,#6366f1_0%,#7c3aed_55%,#ff2d9a_100%)] hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? 'Redirecting…' : 'Continue with Email'}
              </button>
            </form>
          </div>
          <footer className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[0.65rem]">
            <a href="#privacy" className="text-white/90 no-underline hover:underline">
              Privacy Policy
            </a>
            <span className="text-white/50">|</span>
            <a href="#terms" className="text-white/90 no-underline hover:underline">
              Terms of service
            </a>
            <span className="text-white/50">|</span>
            <a href="#trust" className="text-white/90 no-underline hover:underline">
              Trust &amp; Security
            </a>
          </footer>
        </div>
      </div>
    </div>
  )
}
