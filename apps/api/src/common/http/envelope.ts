export type ResponseType = "SUCCESS" | "ERROR"

export interface ResponseStatus {
  code: number
  name: string
  type: ResponseType
  message: string
  messageInd: string
  timeStamp: string
}

export interface ApiEnvelope<T = unknown> {
  data: T | null
  meta?: unknown
  /** Only on errors: machine-readable code + field-level detail. */
  error?: { code: string; detail?: string }
  status: ResponseStatus
}

const STATUS_NAMES: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
}

const MESSAGE_IND: Record<string, string> = {
  OK: "OK",
  Created: "Berhasil dibuat",
  Accepted: "Diterima",
  "No Content": "Tidak ada konten",
  "Bad Request": "Permintaan tidak valid",
  Unauthorized: "Belum terautentikasi",
  Forbidden: "Tidak memiliki akses",
  "Not Found": "Data tidak ditemukan",
  Conflict: "Terjadi konflik data",
  "Unprocessable Entity": "Data tidak dapat diproses",
  "Too Many Requests": "Terlalu banyak permintaan",
  "Internal Server Error": "Terjadi kesalahan server",
  "Service Unavailable": "Layanan belum siap",
  NOT_READY: "Layanan belum siap",
  NOT_FOUND: "Data tidak ditemukan",
  CONFLICT: "Terjadi konflik data",
  TOO_MANY_REQUESTS: "Terlalu banyak percobaan, coba lagi nanti",
  MISSING_REFRESH_TOKEN: "Refresh token tidak ditemukan",
  INVALID_CREDENTIALS: "Email atau password salah",
  INVALID_REFRESH_TOKEN: "Refresh token tidak valid atau sudah kedaluwarsa",
  REFRESH_TOKEN_REUSE_DETECTED: "Refresh token digunakan ulang; sesi dicabut",
  SESSION_USER_NOT_FOUND: "Sesi pengguna tidak ditemukan atau tidak aktif",
  PERMISSION_NOT_DECLARED: "Permission route belum dideklarasikan",
  NOT_AUTHENTICATED: "Belum terautentikasi",
  PERMISSION_NOT_GRANTED: "Permission tidak diberikan",
  TEAM_SCOPE_UNAVAILABLE: "Scope team membutuhkan provider hierarki",
  ROLE_NOT_FOUND: "Role tidak ditemukan",
  ROLE_NAME_TAKEN: "Nama role sudah dipakai",
  SYSTEM_ROLE_IMMUTABLE: "System role tidak dapat diubah",
  ROLE_IN_USE: "Role masih dipakai pengguna",
  LAST_PERMISSION_HOLDER: "Permission harus punya minimal satu pemegang",
  USER_NOT_FOUND: "Pengguna tidak ditemukan",
  EMAIL_TAKEN: "Email sudah digunakan",
  CANNOT_MODIFY_SELF:
    "Tidak dapat mengubah role atau menonaktifkan diri sendiri",
  INVALID_ROLE: "Role tidak valid",
  VALIDATION_ERROR: "Validasi gagal",
}

function jakartaTimestamp(date = new Date()): string {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000)
  return `${shifted.toISOString().replace("Z", "")}+07:00`
}

export function statusName(code: number): string {
  return STATUS_NAMES[code] ?? "Unknown"
}

export function buildStatus(input: {
  code: number
  type: ResponseType
  message?: string
  messageInd?: string
  errorCode?: string
}): ResponseStatus {
  const name = statusName(input.code)
  const message = input.message ?? name
  return {
    code: input.code,
    name,
    type: input.type,
    message,
    messageInd:
      input.messageInd ??
      (input.errorCode && MESSAGE_IND[input.errorCode]) ??
      MESSAGE_IND[message] ??
      MESSAGE_IND[name] ??
      message,
    timeStamp: jakartaTimestamp(),
  }
}

export function envelope<T>(input: {
  data: T | null
  code: number
  type: ResponseType
  message?: string
  messageInd?: string
  errorCode?: string
  errorDetail?: string
  meta?: unknown
}): ApiEnvelope<T> {
  return {
    data: input.data,
    ...(input.meta === undefined ? {} : { meta: input.meta }),
    ...(input.errorCode
      ? { error: { code: input.errorCode, detail: input.errorDetail } }
      : {}),
    status: buildStatus(input),
  }
}
