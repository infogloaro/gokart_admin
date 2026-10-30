export function inr(value: number): string {
  const sign = value < 0 ? "-" : ""
  return `${sign}₹${Math.abs(Math.round(value)).toLocaleString("en-IN")}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}
