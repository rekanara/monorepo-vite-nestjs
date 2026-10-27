import type { AppSettings } from "@workspace/contracts"

export interface EmailContent {
  /** Inbox preview line; hidden in the body. */
  preheader?: string
  heading: string
  paragraphs: string[]
  button?: { label: string; url: string }
  /** One-time code, shown large and monospaced. */
  code?: string
  /** Small muted print under the content (expiry, "ignore if not you"). */
  note?: string
}

export type EmailBrand = Pick<
  AppSettings,
  | "appName"
  | "tagline"
  | "logoUrl"
  | "supportEmail"
  | "supportPhone"
  | "emailFooter"
  | "address"
  | "district"
  | "city"
  | "province"
  | "country"
  | "postalCode"
>

// ponytail: colours mirror packages/ui globals.css (light theme); email clients
// can't read CSS variables. Move to app settings if per-tenant colours are needed.
const C = {
  bg: "#f3f6f7",
  card: "#ffffff",
  text: "#0f2328",
  muted: "#5d7178",
  border: "#dfe7e9",
  primary: "#0b7a8c",
  primaryText: "#ffffff",
  tint: "#eaf5f7",
}
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace"

export const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

/** Only http(s) links reach an href/src; anything else is dropped. */
const safeUrl = (url: string | null | undefined) =>
  url && /^https?:\/\//i.test(url) ? escapeHtml(url) : null

export function renderEmail(content: EmailContent, brand: EmailBrand): string {
  const logo = safeUrl(brand.logoUrl)
  const buttonUrl = content.button ? safeUrl(content.button.url) : null
  const address = [
    brand.address,
    brand.district,
    brand.city,
    brand.province,
    brand.country,
    brand.postalCode,
  ]
    .filter(Boolean)
    .join(", ")
  const contact = [
    brand.supportEmail
      ? `<a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${C.primary};text-decoration:none;">${escapeHtml(brand.supportEmail)}</a>`
      : "",
    brand.supportPhone ? escapeHtml(brand.supportPhone) : "",
  ]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ")

  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${C.text};">${escapeHtml(p)}</p>`
    )
    .join("")

  const button =
    content.button && buttonUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:8px;background:${C.primary};"><a href="${buttonUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:${C.primaryText};text-decoration:none;border-radius:8px;">${escapeHtml(content.button.label)}</a></td></tr></table>` +
        `<p style="margin:0 0 16px;font-size:12px;line-height:18px;color:${C.muted};">Button not working? Copy this link into your browser:<br /><a href="${buttonUrl}" style="color:${C.primary};word-break:break-all;">${buttonUrl}</a></p>`
      : ""

  const code = content.code
    ? `<div style="margin:8px 0 20px;padding:16px;text-align:center;background:${C.tint};border:1px solid ${C.border};border-radius:8px;font-family:${MONO};font-size:32px;font-weight:700;letter-spacing:8px;color:${C.text};">${escapeHtml(content.code)}</div>`
    : ""

  const note = content.note
    ? `<p style="margin:0;font-size:13px;line-height:20px;color:${C.muted};">${escapeHtml(content.note)}</p>`
    : ""

  const footerLines = [
    brand.emailFooter
      ? `<p style="margin:0 0 8px;">${escapeHtml(brand.emailFooter)}</p>`
      : "",
    contact ? `<p style="margin:0 0 8px;">${contact}</p>` : "",
    address ? `<p style="margin:0 0 8px;">${escapeHtml(address)}</p>` : "",
  ].join("")

  const preheader = content.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div>`
    : ""

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.border};border-radius:12px;overflow:hidden;">
<tr><td style="height:4px;background:${C.primary};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 32px 0;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
${logo ? `<td style="padding-right:10px;"><img src="${logo}" alt="" height="32" style="display:block;height:32px;width:auto;border:0;" /></td>` : ""}
<td style="font-size:18px;font-weight:700;color:${C.text};">${escapeHtml(brand.appName)}</td>
</tr></table>
</td></tr>
<tr><td style="padding:24px 32px 32px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:700;color:${C.text};">${escapeHtml(content.heading)}</h1>
${paragraphs}${button}${code}${note}
</td></tr>
<tr><td style="padding:20px 32px;background:${C.bg};border-top:1px solid ${C.border};font-size:12px;line-height:18px;color:${C.muted};">
${brand.tagline ? `<p style="margin:0 0 8px;font-weight:600;color:${C.text};">${escapeHtml(brand.tagline)}</p>` : ""}
${footerLines}
<p style="margin:0;">&copy; ${new Date().getFullYear()} ${escapeHtml(brand.appName)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
