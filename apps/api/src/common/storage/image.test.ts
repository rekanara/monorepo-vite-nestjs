import { describe, expect, it } from "vitest"
import { detectImage } from "./image"

describe("detectImage", () => {
  it("recognises JPEG, PNG and WebP by magic bytes", () => {
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg")
    expect(
      detectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        ?.ext
    ).toBe("png")
    expect(detectImage(Buffer.from("RIFF0000WEBPVP8 "))?.ext).toBe("webp")
  })
  it("rejects anything else, including SVG", () => {
    expect(detectImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull()
    expect(detectImage(Buffer.alloc(0))).toBeNull()
  })
})
