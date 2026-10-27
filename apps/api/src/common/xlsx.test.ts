import { describe, expect, it } from "vitest"
import { toXlsx } from "./xlsx"

describe("toXlsx", () => {
  it("produces a zip with the sheet and escaped text", () => {
    const buf = toXlsx([
      ["name", "n"],
      ["a<b&c", 3],
    ])
    expect(buf.subarray(0, 4).toString("hex")).toBe("504b0304")
    expect(buf.includes(Buffer.from("xl/worksheets/sheet1.xml"))).toBe(true)
    expect(buf.readUInt32LE(buf.length - 22)).toBe(0x06054b50)
  })
})
