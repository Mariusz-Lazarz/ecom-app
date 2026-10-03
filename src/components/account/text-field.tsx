import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type TextFieldProps = {
  // Prefixes the input's id, so two forms on one page can't clash.
  form: string
  name: string
  label: string
  type?: string
  autoComplete?: string
  defaultValue?: string
  required?: boolean
  description?: string
  errors?: string[]
  className?: string
  onChange?: (value: string) => void
}

/** A labelled input with an optional hint and its errors, wired up for screen readers. */
export function TextField({
  form,
  name,
  label,
  type = "text",
  autoComplete,
  defaultValue,
  required = true,
  description,
  errors,
  className,
  onChange,
}: TextFieldProps) {
  const id = `${form}-${name}`
  const describedBy = [errors?.length ? `${id}-error` : null, description ? `${id}-description` : null]
    .filter(Boolean)
    .join(" ")
  return (
    <Field data-invalid={errors?.length ? true : undefined} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        onChange={onChange && ((event) => onChange(event.target.value))}
        required={required}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="h-10"
      />
      {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}
