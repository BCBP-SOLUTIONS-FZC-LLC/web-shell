// Infrastructure: whether this device has shown the "workspace upgraded" welcome (A5), in the SDK's
// storage() for the shell, scoped to the signed-in workspace (implements UpgradeWelcomeRepository).
// The SDK clears it on sign-out and workspace switch, so a user who signs out within the welcome's
// window (UPGRADE_WELCOME_DAYS) sees it once more after signing in again.
import { storage } from '@bcbp-solutions-fzc-llc/frontend-sdk/storage'
import type { UpgradeWelcomeRepository } from '../../domain/repositories/workspaceStatus'

const SEEN_KEY = 'upgradeWelcomeSeen'

export const upgradeWelcomeStorage: UpgradeWelcomeRepository = {
  seen: () => storage('shell').get<boolean>(SEEN_KEY) === true,
  markSeen: () => storage('shell').set(SEEN_KEY, true),
}
