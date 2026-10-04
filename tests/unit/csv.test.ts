import { describe, expect, it } from "vitest"

import { toCsv } from "@/lib/csv"

describe("toCsv", () => {
  it("joins fields with commas and rows with CRLF, ending with a line break", () => {
    expect(toCsv([["email", "source"], ["ada@example.com", "home"]])).toBe("email,source\r\nada@example.com,home\r\n")
  })

  it("writes just the header row when there's no data", () => {
    expect(toCsv([["email"]])).toBe("email\r\n")
  })

  it("quotes fields with commas, quotes or line breaks and doubles the quotes", () => {
    expect(toCsv([["a,b", 'say "hi"', "two\nlines", "cr\rhere"]])).toBe('"a,b","say ""hi""","two\nlines","cr\rhere"\r\n')
  })

  it("defuses spreadsheet formulas with a leading quote", () => {
    expect(toCsv([["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "a=b"]])).toBe("'=SUM(A1),'+1,'-1,'@cmd,'\tx,a=b\r\n")
  })

  it("writes numbers as they are and null or undefined as empty fields", () => {
    expect(toCsv([[42, null, undefined, 0]])).toBe("42,,,0\r\n")
  })
})
