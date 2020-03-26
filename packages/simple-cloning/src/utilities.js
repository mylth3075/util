export function isLeaf(value) {
  if (
    typeof value === 'object' &&
    !(value === null || value instanceof Date || value instanceof RegExp || value instanceof Error)
  ) {
    return false;
  }

  return true;
}
