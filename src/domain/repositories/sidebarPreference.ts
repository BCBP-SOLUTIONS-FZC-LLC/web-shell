// Contract: whether the user keeps the shell's sidebar collapsed to its icon rail. The composition root
// injects an implementation (infrastructure/storage/sidebarPreference.ts); the sidebar never reaches storage.
export interface SidebarPreferenceRepository {
  collapsed(): boolean
  setCollapsed(collapsed: boolean): void
}
