import { describe, expect, it } from "vitest"
import { CsvParseError, parseCsv, toCsv } from "./csv"

describe("parseCsv", () => {
  it("parses LF and CRLF", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  it("strips BOM and trailing blank lines", () => {
    expect(parseCsv("﻿a,b\n1,2\n\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  it("handles quoted delimiter, newline and doubled quotes", () => {
    expect(parseCsv('a,b\n"x,y","l1\nl2"\n"say ""hi""",z')).toEqual([
      ["a", "b"],
      ["x,y", "l1\nl2"],
      ['say "hi"', "z"],
    ])
  })

  it("detects semicolon from the header", () => {
    expect(parseCsv("a;b\n1,5;2")).toEqual([
      ["a", "b"],
      ["1,5", "2"],
    ])
  })

  it("ignores delimiters inside quotes when detecting, ties use comma", () => {
    expect(parseCsv('"a;b;c",d\n1,2')[0]).toEqual(["a;b;c", "d"])
    expect(parseCsv("a,b;c\n1,2;3")[0]).toEqual(["a", "b;c"])
  })

  it("throws a typed error with the row of the unterminated quote", () => {
    try {
      parseCsv('a,b\n1,2\n3,"oops\n4,5')
      throw new Error("no throw")
    } catch (e) {
      expect(e).toBeInstanceOf(CsvParseError)
      expect((e as CsvParseError).row).toBe(3)
    }
  })
})

describe("toCsv", () => {
  it("quotes, escapes and neutralises formulas", () => {
    expect(toCsv([["a,b", '"q"', "=1+1", 5, null]])).toBe(
      '\uFEFF"a,b","""q""",\'=1+1,5,\r\n'
    )
  })
})
