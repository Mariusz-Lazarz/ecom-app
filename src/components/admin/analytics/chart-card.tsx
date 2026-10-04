import { useId, type ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export type ChartTableRow = { key: string; cells: ReactNode[] }

type ChartCardProps = {
  title: string
  // One sentence with the takeaway: shown under the title and names the chart for screen readers.
  summary: string
  // Column headings and rows of the "Show data" table, the chart's text alternative.
  columns: string[]
  rows: ChartTableRow[]
  children: ReactNode
  className?: string
}

/**
 * A chart in a card: the title, a summary sentence that also labels the figure, the chart and a
 * collapsible table with the same numbers.
 */
export function ChartCard({ title, summary, columns, rows, children, className }: ChartCardProps) {
  const id = useId()
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </CardTitle>
        <CardDescription id={`${id}-summary`}>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <figure aria-labelledby={`${id}-title`} aria-describedby={`${id}-summary`}>
          {children}
        </figure>
        <details className="group text-sm">
          <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">Show data</summary>
          <div className="mt-2 max-h-72 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column, index) => (
                    <TableHead key={column} className={index > 0 ? "text-right" : undefined}>
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    {row.cells.map((cell, index) => (
                      <TableCell key={index} className={index > 0 ? "text-right tabular-nums" : undefined}>
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
