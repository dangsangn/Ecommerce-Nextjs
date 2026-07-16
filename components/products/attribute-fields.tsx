'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProductType } from '@/types/product'

function Field({ name, label, required, defaultValue }: { name: string; label: string; required?: boolean; defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}{required ? '' : ' (optional)'}</Label>
      <Input id={name} name={name} required={required} defaultValue={defaultValue} />
    </div>
  )
}

export function AttributeFields({ type, defaults }: { type: ProductType; defaults?: Record<string, unknown> }) {
  const dv = (k: string) => (defaults?.[k] != null ? String(defaults[k]) : undefined)
  if (type === 'CLOTHING') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="brand" label="Brand" required defaultValue={dv('brand')} />
        <Field name="color" label="Color" required defaultValue={dv('color')} />
        <Field name="size" label="Size" required defaultValue={dv('size')} />
        <Field name="material" label="Material" defaultValue={dv('material')} />
      </div>
    )
  }
  if (type === 'ELECTRONICS') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="manufacturer" label="Manufacturer" required defaultValue={dv('manufacturer')} />
        <Field name="model" label="Model" defaultValue={dv('model')} />
      </div>
    )
  }
  return <p className="text-sm text-muted-foreground">This product type isn&apos;t available yet.</p>
}
