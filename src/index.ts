// Module Federation needs an async boundary before shared modules are used (SDK design doc §C2).
// Identity and runtime config are fatal: without them the page shows a static message.
export function showUnavailable(error: unknown): void {
  console.error('the app could not start', error)
  const p = document.createElement('p')
  p.setAttribute('role', 'alert')
  p.className = 'flex min-h-dvh items-center justify-center bg-[#030d1b] px-6 text-center font-sans text-white/80'
  p.textContent = 'The app is unavailable right now. Please try again later.'
  document.getElementById('app')?.replaceChildren(p)
}

export const started: Promise<void> = import('./bootstrap').then((m) => m.bootstrap()).catch(showUnavailable)
