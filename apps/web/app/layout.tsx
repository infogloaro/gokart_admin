import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "GoKart Admin",
  description: "Admin portals for ZOAURO FOOD and GLOARO MART",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
