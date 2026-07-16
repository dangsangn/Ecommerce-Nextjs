import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Discount } from '@/types/discount'

function formatDate(s: string): string {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10)
}

function valueLabel(d: Discount): string {
  return d.discount_type === 'percentage' ? `${d.discount_value}%` : String(d.discount_value)
}

function statusBadge(d: Discount) {
  if (d.is_expired) return <Badge variant="destructive">Expired</Badge>
  if (d.discount_is_active === false) return <Badge variant="secondary">Inactive</Badge>
  return <Badge>Active</Badge>
}

export function DiscountList({ discounts }: { discounts: Discount[] }) {
  if (discounts.length === 0) {
    return <p className="text-sm text-muted-foreground">No discounts yet.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Valid</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {discounts.map((d) => (
          <TableRow key={d._id}>
            <TableCell className="font-medium">{d.discount_code}</TableCell>
            <TableCell>{d.discount_name}</TableCell>
            <TableCell><Badge variant="secondary">{d.discount_type}</Badge></TableCell>
            <TableCell>{valueLabel(d)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatDate(d.discount_start_date)} – {formatDate(d.discount_end_date)}
            </TableCell>
            <TableCell>{statusBadge(d)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
