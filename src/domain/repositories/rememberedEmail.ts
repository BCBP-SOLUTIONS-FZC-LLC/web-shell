// Domain contract: the email the sign-in page remembers. Infrastructure implements it
// (platform/rememberedEmail.ts, localStorage); presentation receives it and never touches storage.

/** The email the user asked the sign-in page to remember. Holds the typed email only, never a token. */
export interface RememberedEmailRepository {
  /** The remembered email, or '' when none (or when storage is unavailable). */
  get(): string
  /** Remembers `email` when `remember`, otherwise forgets any remembered email. Never throws. */
  save(email: string, remember: boolean): void
}
