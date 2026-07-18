export function canonicalCourseCode(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function catalogCourseStableId(sourceId: string, code: string): string {
  const normalizedSource = sourceId.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalizedSource)) {
    throw new Error(`Invalid catalog source ID: ${sourceId}`);
  }

  return `${normalizedSource}:${canonicalCourseCode(code)}`;
}
