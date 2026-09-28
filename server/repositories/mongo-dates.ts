// Domain dates are ISO strings; Mongo stores BSON dates. An unparseable string is a caller bug.
export function parseInstant(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date "${value}".`);
  }
  return date;
}
