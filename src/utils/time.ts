export function formatDisplayTime(value: Date | string, offset = '+04:00', locale = 'en'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const sign = offset.startsWith('-') ? -1 : 1;
  const [hours = 0, minutes = 0] = offset.slice(1).split(':').map(Number);
  const shifted = new Date(date.getTime() + sign * (hours * 60 + minutes) * 60_000);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(shifted);
}
