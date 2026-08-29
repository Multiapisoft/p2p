/** Only assign defined keys — prevents Nest DTO undefined wipe on mongoose docs. */
export function assignDefinedFields<T extends object>(
  target: T,
  source: Record<string, unknown> | object,
): T {
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  }
  return target;
}
