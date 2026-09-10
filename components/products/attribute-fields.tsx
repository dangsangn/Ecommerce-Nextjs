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
    // Color and size are gone from here on purpose: they are variation AXES —
    // the thing that makes one shirt several warehouse codes — so they belong in
    // the variant editor. What stays are the attributes every variant shares.
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="brand" label="Brand" required defaultValue={dv('brand')} />
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
