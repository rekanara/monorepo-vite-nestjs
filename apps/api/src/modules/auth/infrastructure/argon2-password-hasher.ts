import { Injectable } from "@nestjs/common"
import * as argon2 from "argon2"
import { PasswordHasherPort } from "../domain/ports/password-hasher.port"

@Injectable()
export class Argon2PasswordHasher implements PasswordHasherPort {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id })
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain)
  }
}
