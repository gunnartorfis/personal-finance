type MessageTree = { [key: string]: string | MessageTree }

/**
 * Flatten a (possibly nested) message catalog into sorted dot-path keys, so two
 * locales' key sets can be compared for parity (ADR-0013). Enforced by
 * `parity.test.ts`; the blocking CI check arrives in the enforcement slice.
 */
export function flattenKeys(tree: MessageTree, prefix = ""): string[] {
  return Object.keys(tree)
    .flatMap((key) => {
      const value = tree[key]
      const path = prefix ? `${prefix}.${key}` : key
      return typeof value === "string" ? [path] : flattenKeys(value, path)
    })
    .sort()
}
