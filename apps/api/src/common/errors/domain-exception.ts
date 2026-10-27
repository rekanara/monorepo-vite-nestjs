export abstract class DomainException extends Error {
  readonly code: string
  readonly title: string
  readonly status: number

  constructor(opts: { code: string; title: string; status: number }) {
    super(opts.title)
    this.code = opts.code
    this.title = opts.title
    this.status = opts.status
  }
}
