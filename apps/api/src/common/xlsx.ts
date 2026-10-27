import { crc32, deflateRawSync } from "node:zlib"

// ponytail: single sheet, inline strings, no styles. Add exceljs if you need
// formatting, formulas, multiple sheets or streaming of very large exports.
const esc = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")

const col = (i: number) => {
  let n = i + 1
  let s = ""
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function sheetXml(rows: unknown[][]): string {
  const body = rows
    .map(
      (r, y) =>
        `<row r="${y + 1}">${r
          .map((v, x) => {
            const ref = `${col(x)}${y + 1}`
            if (typeof v === "number" && Number.isFinite(v))
              return `<c r="${ref}"><v>${v}</v></c>`
            const text = v == null ? "" : String(v)
            return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`
          })
          .join("")}</row>`
    )
    .join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

function zip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name)
    const raw = Buffer.from(text)
    const data = deflateRawSync(raw)
    const crc = crc32(raw)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    parts.push(local, nameBuf, data)
    const head = Buffer.alloc(46)
    head.writeUInt32LE(0x02014b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(20, 6)
    head.writeUInt16LE(0x0800, 8)
    head.writeUInt16LE(8, 10)
    head.writeUInt32LE(crc, 16)
    head.writeUInt32LE(data.length, 20)
    head.writeUInt32LE(raw.length, 24)
    head.writeUInt16LE(nameBuf.length, 28)
    head.writeUInt32LE(offset, 42)
    central.push(head, nameBuf)
    offset += local.length + nameBuf.length + data.length
  }
  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(central.length / 2, 8)
  end.writeUInt16LE(central.length / 2, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, dir, end])
}

export function toXlsx(rows: unknown[][], sheetName = "Sheet1"): Buffer {
  const ns = 'xmlns="http://schemas.openxmlformats.org/'
  return zip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types ${ns}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships ${ns}package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook ${ns}spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships ${ns}package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": sheetXml(rows),
  })
}
