// Module Federation needs an async boundary before shared modules are used (SDK design doc §C2).
// Identity and runtime config are fatal: without them the page shows a static message.
export function showUnavailable(error: unknown): void {
  console.error('the app could not start', error)
  const box = document.createElement('div')
  box.setAttribute('role', 'alert')
  box.className =
    'flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#030d1b] px-6 text-center font-sans text-white/80'
  const text = document.createElement('p')
  text.textContent = 'The app is unavailable right now. Please try again later.'
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = 'Try again'
  retry.className =
    'cursor-pointer rounded-lg border border-white/30 bg-transparent px-4 py-2 text-sm font-semibold text-white'
  retry.addEventListener('click', () => window.location.reload())
  box.append(text, retry)
  document.getElementById('app')?.replaceChildren(box)
}

export const started: Promise<void> = import('./bootstrap').then((m) => m.bootstrap()).catch(showUnavailable)
