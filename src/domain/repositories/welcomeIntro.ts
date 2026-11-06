// Domain contract: whether this browser has seen the welcome intro before the sign-in page.
// Infrastructure implements it (infrastructure/storage/welcomeIntro.ts, localStorage); presentation
// receives it through the sign-in use cases and never touches storage.

/** The first-visit welcome intro: shown until the user continues or skips it once. Holds no personal data. */
export interface WelcomeIntroRepository {
  /** True once the intro was completed or skipped in this browser (false when storage is unavailable). */
  seen(): boolean
  /** Remembers that the intro was completed or skipped. Never throws. */
  markSeen(): void
}
