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

  it("defuses a formula that also needs quoting, doubling its quotes", () => {
    expect(toCsv([['=HYPERLINK("http://evil.example","click")', "-1,2", "\rcmd", "@x\ny"]])).toBe(
      '"\'=HYPERLINK(""http://evil.example"",""click"")","\'-1,2","\'\rcmd","\'@x\ny"\r\n',
    )
  })

  it("leaves numbers alone, negative ones included, but defuses the same text", () => {
    expect(toCsv([[-5, "-5", 1.5, "+1.5"]])).toBe("-5,'-5,1.5,'+1.5\r\n")
  })

  it("only looks at the first character for formulas and keeps empty strings empty", () => {
    expect(toCsv([[" =1", "a-b", "", "'already"]])).toBe(" =1,a-b,,'already\r\n")
  })

  it("quotes a lone quote and a field that is only a line break", () => {
    expect(toCsv([['"', "\n"]])).toBe('"""","\n"\r\n')
  })
})
