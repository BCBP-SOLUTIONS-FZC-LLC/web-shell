// The router the SDK's navigate(appId, path) uses (/nav registerNavigator). A remote's navigate() to a
// path under this shell's router basename stays in the single-page app; any other same-origin path
// (another workspace, a page outside the router) is a full page load, as navigate() does without a
// registered router. The SDK has already checked the path with isSafeRedirect. The path decides: `appId` is
// ignored, so a cross-remote path carries the workspace prefix. The router navigate it is given remounts the
// section the shell's routes show when a move inside it changes the path or query (App.tsx RouterBridge): a
// remote's own router does not see this one's navigation.

/** react-router's navigate, reduced to what is used here. */
export type RouterNavigate = (to: string, o?: { replace?: boolean }) => void

export function shellNavigator(
  routerNavigate: RouterNavigate,
  basename: string | undefined,
): (appId: string, path: string, o?: { replace?: boolean }) => void {
  return (_appId, path, o) => {
    const url = new URL(path, window.location.origin)
    const base = basename ?? ''
    const inside = url.pathname === base || url.pathname.startsWith(`${base}/`)
    if (!inside) {
      if (o?.replace) window.location.replace(url.href)
      else window.location.assign(url.href)
      return
    }
    routerNavigate(`${url.pathname.slice(base.length) || '/'}${url.search}${url.hash}`, o?.replace ? { replace: true } : {})
  }
}
