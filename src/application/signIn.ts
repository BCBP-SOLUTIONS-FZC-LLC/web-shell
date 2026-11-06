// What the sign-in screens need, as use cases: built once by the composition root (bootstrap.tsx)
// from infrastructure, and passed to the screens, which import no infrastructure.
import type { RememberedEmailRepository } from '../domain/repositories/rememberedEmail'
import type { RequestPasswordReset } from './use-cases/requestPasswordReset'
import type { ResolveWorkspace } from './use-cases/resolveWorkspace'

export interface SignInUseCases {
  resolveWorkspace: ResolveWorkspace
  requestPasswordReset: RequestPasswordReset
  rememberedEmail: RememberedEmailRepository
}
