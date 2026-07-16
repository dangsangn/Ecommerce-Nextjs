import { CreateProductForm } from '@/components/products/create-product-form'

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New product</h1>
        <p className="text-sm text-muted-foreground">Upload images, then add product details.</p>
      </div>
      <CreateProductForm />
    </div>
  )
}
