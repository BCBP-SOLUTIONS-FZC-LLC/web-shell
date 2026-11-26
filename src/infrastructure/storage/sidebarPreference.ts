// Infrastructure: whether the shell's sidebar is collapsed to its icon rail, in the SDK's storage() for the
// shell, scoped to the signed-in workspace (implements SidebarPreferenceRepository). The SDK clears it on
// sign-out and workspace switch, so the next sign-in starts expanded.
import { storage } from '@bcbp-solutions-fzc-llc/frontend-sdk/storage'
import type { SidebarPreferenceRepository } from '../../domain/repositories/sidebarPreference'

const COLLAPSED_KEY = 'sidebarCollapsed'

export const sidebarPreferenceStorage: SidebarPreferenceRepository = {
  collapsed: () => storage('shell').get<boolean>(COLLAPSED_KEY) === true,
  setCollapsed: (collapsed) => storage('shell').set(COLLAPSED_KEY, collapsed),
}
