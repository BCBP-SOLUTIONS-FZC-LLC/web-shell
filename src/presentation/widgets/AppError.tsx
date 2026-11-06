import { useEffect, useRef } from 'react'
import { useShellText } from '../../shared/i18n'

/**
 * What the shell shows when its own screens fail to render (the error boundary around the routes).
 * Never the error's message: it is not translated and may be a server's. The reference (trace or
 * request id) lets support find the logged error.
 */
export function AppError({ reference, onRetry }: { reference?: string | undefined; onRetry: () => void }) {
  const text = useShellText()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#030d1b] px-6 text-center font-sans text-white/80 outline-none"
    >
      <p>{text('app.error')}</p>
      {reference ? (
        <p className="text-xs text-white/60">
          {text('app.error.reference')}: <code>{reference}</code>
        </p>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer rounded-lg border border-white/30 bg-transparent px-4 py-2 text-sm font-semibold text-white"
      >
        {text('common.tryAgain')}
      </button>
    </div>
  )
}
