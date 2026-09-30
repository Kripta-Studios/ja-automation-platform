export type TaxProfileComponent = Readonly<{
  name: string;
  basisPoints: string;
  compound: boolean;
}>;

/** Tax profile components allow 0–100000 basis points; never infer a missing rate. */
export function formatTaxBasisPoints(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 16 || !/^\d+$/u.test(value)) return null;
  const basisPoints = BigInt(value);
  if (basisPoints > 100000n) return null;
  const digits = basisPoints.toString().padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}%`;
}

/** Keep configured calculation order; malformed metadata remains unavailable. */
export function taxProfileComponents(value: unknown): readonly TaxProfileComponent[] | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const components: TaxProfileComponent[] = [];
    for (const component of parsed) {
      if (
        !component ||
        typeof component.name !== 'string' ||
        formatTaxBasisPoints(component.basisPoints) === null ||
        (component.compound !== 0 && component.compound !== 1)
      )
        return null;
      components.push({
        name: component.name,
        basisPoints: component.basisPoints,
        compound: component.compound === 1,
      });
    }
    return components;
  } catch {
    return null;
  }
}
