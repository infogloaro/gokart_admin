const NAV_ICON_PATHS: Record<string, string> = {
  "Global dashboard": "M4 4h7v7H4ZM13 4h7v4h-7ZM13 11h7v9h-7ZM4 14h7v6H4Z",
  "Business overview": "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3",
  "Food revenue": "M6 8h12l-1 12H7ZM9 8a3 3 0 0 1 6 0M10 13a2 2 0 0 0 4 0",
  "Mart revenue": "M6 8h12l-1 12H7ZM9 8a3 3 0 0 1 6 0M10 13a2 2 0 0 0 4 0",
  Vendors:
    "M4 10 5.5 4h13L20 10M4 10a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5 12v8h14v-8M10 20v-5h4v5",
  "Delivery partners":
    "M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 16l3-6h5l4 6M9 10 8 7H6M13 6h3l1 4",
  Orders: "M12 3 4 7v10l8 4 8-4V7ZM4 7l8 4 8-4M12 11v10",
  "Complaints & exceptions": "M5 5h14v10h-7l-4 4v-4H5ZM12 8v3M12 13h.01",
  "Live tracking":
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 3v3M12 18v3M3 12h3M18 12h3M12 21a9 9 0 1 1 0-18",
  "Transaction ledger": "M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 8h6M9 12h6M9 16h3",
  "Finance & payouts": "M4 6h16v12H4ZM4 10h16M7 15h3",
  Reports: "M12 3v9h9A9 9 0 1 1 12 3ZM15 3.5A9 9 0 0 1 20.5 9H15Z",
  "Admin & permissions":
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20a6 6 0 0 1 10-4.5M17 14v1.5M17 20v-1.5M14.4 16l1.3.8M19.6 18.8l-1.3-.8M14.4 18.8l1.3-.8M19.6 16l-1.3.8",
  "Areas & fees":
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12l1.5-1-1.5-3-1.8.4a6 6 0 0 0-1.2-.7L15.5 6h-3l-.5 1.7a6 6 0 0 0-1.2.7L9 8 7.5 11l1.5 1a6 6 0 0 0 0 1.4L7.5 14.5 9 17.5l1.8-.4c.4.3.8.5 1.2.7l.5 1.7h3l.5-1.7c.4-.2.8-.4 1.2-.7l1.8.4 1.5-3-1.5-1A6 6 0 0 0 19 12Z",
  "Audit logs": "M3 12h4l3-8 4 16 3-8h4",
}

export default function NavIcon({ item }: { item: string }) {
  const path = NAV_ICON_PATHS[item]
  if (!path) return null
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="admin-nav-icon">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
