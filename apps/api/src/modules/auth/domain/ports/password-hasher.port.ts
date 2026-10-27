export interface PasswordHasherPort {
  hash(plain: string): Promise<string>
  verify(hash: string, plain: string): Promise<boolean>
}

export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER")
