import { Input } from "@/components/ui/input"

type FieldProps = {
  name: string
  label: string
  type?: string
  autoComplete?: string
  defaultValue?: string
  errors?: string[]
}

export function Field({ name, label, type = "text", autoComplete, defaultValue, errors }: FieldProps) {
  const errorId = `${name}-error`
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
        className="h-10"
      />
      {errors && (
        <ul id={errorId} className="space-y-0.5 text-xs text-destructive">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
