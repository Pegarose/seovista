// exactOptionalPropertyTypes: FormField's optional `error` can't receive an
// explicit `undefined`, so spread the field error only when one is present.
export function fieldErrorProps(errors?: string[]): { error: string } | {} {
  return errors?.length ? { error: errors.join(", ") } : {};
}
