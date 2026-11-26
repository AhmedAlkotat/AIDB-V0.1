// Up to two initials from a display name (the first letters of its first two words).
export function getInitials(displayName) {
  return String(displayName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join(' ')
}
