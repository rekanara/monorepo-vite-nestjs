import { describe, expect, it } from "vitest"
import { renderEmail, type EmailBrand } from "./email-template"

const brand: EmailBrand = {
  appName: "Acme <b>",
  tagline: "Built to ship",
  logoUrl: "https://cdn.test/logo.png",
  supportEmail: "help@acme.test",
  supportPhone: "+62 812 0000",
  emailFooter: "Footer & more",
  address: "Jl. Sudirman 1",
  district: null,
  city: "Jakarta",
  province: null,
  country: "Indonesia",
  postalCode: "10220",
}

describe("renderEmail", () => {
  it("renders brand, button, fallback link and footer", () => {
    const html = renderEmail(
      {
        heading: "Reset your password",
        paragraphs: ["Hello"],
        button: { label: "Go", url: "https://app.test/reset?token=abc" },
        note: "Expires soon",
      },
      brand
    )
    expect(html).toContain("<!doctype html>")
    expect(html).toContain('src="https://cdn.test/logo.png"')
    expect(html).toContain("Acme &lt;b&gt;")
    expect(html).toContain('href="https://app.test/reset?token=abc"')
    expect(html).toContain("Built to ship")
    expect(html).toContain("Footer &amp; more")
    expect(html).toContain("Jl. Sudirman 1, Jakarta, Indonesia, 10220")
    expect(html).toContain("mailto:help@acme.test")
  })

  it("escapes content and drops non-http links", () => {
    const html = renderEmail(
      {
        heading: "<script>alert(1)</script>",
        paragraphs: ['"><img src=x onerror=alert(1)>'],
        button: { label: "Go", url: "javascript:alert(1)" },
        code: "123456",
      },
      { ...brand, logoUrl: "javascript:alert(1)" }
    )
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img src=x")
    expect(html).not.toContain("javascript:")
    expect(html).toContain("123456")
  })
})
