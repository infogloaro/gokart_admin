"use client"
// ⌘K / Ctrl+K search across screens, orders, vendors and delivery partners (GET /search).
import { businessName, orderStatusLabel, type Business } from "@zoauro/shared"
import { Bike, CornerDownLeft, LayoutGrid, Loader2, ReceiptText, Search, Store } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useGlobalSearch } from "@/lib/dashboard"
import type { Screen } from "@/lib/navigation"
import { Badge, Modal } from "./ui"

type Hit = {
  id: string
  icon: ReactNode
  title: string
  detail: string
  tag?: ReactNode
  href: string
}

export function GlobalSearch({
  close,
  open,
  screens,
  href,
  record = (page, business, code) =>
    `/super/${page}?${business ? `business=${business}&` : ""}search=${encodeURIComponent(code)}`,
}: {
  close: () => void
  open: (href: string) => void
  /** Screens this member can see. */
  screens: Screen[]
  /** Builds a link to a screen that keeps the current business. */
  href: (key: string, extra?: string) => string
  /** Link to one record in its list; each portal has its own URLs. */
  record?: (
    page: "orders" | "vendors" | "partners",
    business: Business | null,
    code: string,
  ) => string
}) {
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [cursor, setCursor] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200)
    return () => clearTimeout(t)
  }, [q])
  const results = useGlobalSearch(debounced)

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    const pages: Hit[] = screens
      .filter((s) => !term || `${s.label} ${s.title}`.toLowerCase().includes(term))
      .slice(0, term ? 4 : 6)
      .map((s) => ({
        id: `page-${s.key}`,
        icon: <s.icon size={16} />,
        title: s.label,
        detail: s.subtitle,
        href: href(s.key),
      }))
    const r = debounced.length >= 2 ? results.data : undefined
    const out: { label: string; hits: Hit[] }[] = [{ label: "Screens", hits: pages }]
    if (r?.orders.length)
      out.push({
        label: "Orders",
        hits: r.orders.map((o) => ({
          id: `order-${o.id}`,
          icon: <ReceiptText size={16} />,
          title: o.code,
          detail: `${o.customerName} · ${o.vendorName} · ${orderStatusLabel(o.business, o.status)}`,
          tag: <Badge tone={o.business}>{o.business === "food" ? "FOOD" : "MART"}</Badge>,
          href: record("orders", o.business, o.code),
        })),
      })
    if (r?.vendors.length)
      out.push({
        label: "Vendors",
        hits: r.vendors.map((v) => ({
          id: `vendor-${v.id}`,
          icon: <Store size={16} />,
          title: v.name,
          detail: `${v.code} · ${businessName[v.business]}`,
          tag: <Badge tone={v.business}>{v.status.replace("_", " ")}</Badge>,
          href: record("vendors", v.business, v.code),
        })),
      })
    if (r?.partners.length)
      out.push({
        label: "Delivery partners",
        hits: r.partners.map((p) => ({
          id: `partner-${p.id}`,
          icon: <Bike size={16} />,
          title: p.name,
          detail: p.code,
          tag: <Badge>{p.status.replace("_", " ")}</Badge>,
          href: record("partners", null, p.code),
        })),
      })
    return out.filter((g) => g.hits.length)
  }, [q, debounced, results.data, screens, href, record])

  const flat = groups.flatMap((g) => g.hits)
  const safeCursor = Math.min(cursor, Math.max(0, flat.length - 1))
  const go = (h: Hit | undefined) => {
    if (!h) return
    open(h.href)
    close()
  }
  const searching = debounced.length >= 2 && results.isFetching
  const nothing =
    debounced.length >= 2 &&
    !results.isFetching &&
    groups.length <= 1 &&
    results.data &&
    !results.data.orders.length &&
    !results.data.vendors.length &&
    !results.data.partners.length

  return (
    <Modal
      title="Search GoKart"
      subtitle="Jump to a screen, order, vendor or delivery partner."
      close={close}
    >
      <div className="modal-body global-search">
        <label className="field">
          <div className="control">
            <Search size={17} />
            <input
              placeholder="Try “ZOF-88219”, “Saffron” or “Delivery partners”"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setCursor(0)
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setCursor((c) => Math.min(c + 1, flat.length - 1))
                } else if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setCursor((c) => Math.max(c - 1, 0))
                } else if (e.key === "Enter") {
                  e.preventDefault()
                  go(flat[safeCursor])
                }
              }}
              aria-label="Search"
              aria-controls="global-search-results"
              aria-activedescendant={flat[safeCursor]?.id}
              role="combobox"
              aria-expanded={flat.length > 0}
              // The dialog opens for typing, so focus belongs here.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            {searching && <Loader2 size={16} className="spin" aria-label="Searching" />}
          </div>
        </label>
        <div
          id="global-search-results"
          role="listbox"
          aria-label="Results"
          className="search-results"
        >
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <small>{g.label}</small>
              {g.hits.map((h) => {
                const i = flat.indexOf(h)
                return (
                  <button
                    type="button"
                    role="option"
                    id={h.id}
                    key={h.id}
                    aria-selected={i === safeCursor}
                    className={i === safeCursor ? "active" : ""}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(h)}
                  >
                    <b>{h.icon}</b>
                    <span>
                      <strong>{h.title}</strong>
                      <small>{h.detail}</small>
                    </span>
                    {h.tag}
                    {i === safeCursor && <CornerDownLeft size={14} className="enter-hint" />}
                  </button>
                )
              })}
            </div>
          ))}
          {nothing && (
            <p className="empty-note">
              <LayoutGrid size={16} /> No orders, vendors or partners match “{debounced}”.
            </p>
          )}
          {q.trim().length === 1 && <p className="empty-note">Keep typing to search records.</p>}
        </div>
        <footer className="search-keys">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>↵</kbd> to open
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </footer>
      </div>
    </Modal>
  )
}
