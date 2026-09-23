const MAX_IP_LENGTH = 64;

// Only the platform-provided header. A caller-supplied forwarded list can change every request.
export function clientIpFromHeaders(headers: Headers): string | null {
  const value = headers.get("x-real-ip")?.trim() ?? "";
  if (!value || value.length > MAX_IP_LENGTH || value.includes(",")) return null;
  return value;
}
