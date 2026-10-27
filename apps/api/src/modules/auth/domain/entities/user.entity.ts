export interface UserProps {
  id: string
  roleId: string
  email: string
  passwordHash: string | null
  isActive?: boolean
  lastLoginAt?: Date | null
  fullName?: string | null
  avatarKey?: string | null
}

export class User {
  private constructor(
    public readonly id: string,
    public readonly roleId: string,
    public readonly email: string,
    public readonly passwordHash: string | null,
    private readonly active: boolean,
    public readonly lastLoginAt: Date | null,
    public readonly fullName: string | null,
    public readonly avatarKey: string | null
  ) {}

  static create(props: UserProps): User {
    const email = props.email.trim().toLowerCase()
    if (!email) throw new Error("email must not be empty")
    return new User(
      props.id,
      props.roleId,
      email,
      props.passwordHash,
      props.isActive ?? true,
      props.lastLoginAt ?? null,
      props.fullName ?? null,
      props.avatarKey ?? null
    )
  }

  get isActive(): boolean {
    return this.active
  }

  get hasPassword(): boolean {
    return this.passwordHash !== null
  }

  canAuthenticate(): boolean {
    return this.active && this.hasPassword
  }
}
