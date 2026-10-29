export function downloadCsv(filenameBase: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n")
  // Prepend a UTF-8 BOM so Excel on Windows detects the encoding correctly
  // instead of mangling non-ASCII characters like ₹ into "â‚¹".
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${filenameBase}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
