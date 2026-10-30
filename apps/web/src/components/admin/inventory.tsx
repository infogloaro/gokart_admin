"use client"
// GLOARO MART: products and stock for the admin's zones, with stock changes in a drawer.
import * as Dialog from "@radix-ui/react-dialog"
import { ApiError } from "@zoauro/api-client"
import { formatINR, STOCK_REASONS, type Product } from "@zoauro/shared"
import {
  AlertTriangle,
  Boxes,
  Minus,
  PackageX,
  Pause,
  Play,
  Plus,
  Search,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import {
  stockState,
  useAdjustStock,
  useInventorySummary,
  useProducts,
  useProductStatus,
} from "@/lib/operations"
import { useMe } from "@/lib/session"
import { AdminBadge, AdminButton, PageHeader } from "./ui"

const PAGE_SIZE = 10
const reasonLabel: Record<(typeof STOCK_REASONS)[number], string> = {
  restock: "Restock from seller",
  sold_offline: "Sold offline",
  damaged: "Damaged or expired",
  count_correction: "Stock count correction",
}
const stockTone = { out: "danger", low: "warning", in: "success" } as const
const stockText = (p: Product) =>
  stockState(p) === "out" ? "Out of stock" : stockState(p) === "low" ? "Low stock" : "In stock"

function Tile({
  label,
  value,
  note,
  icon: Icon,
  tone = "",
}: {
  label: string
  value: string
  note: string
  icon: LucideIcon
  tone?: string
}) {
  return (
    <article className={`metric ${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <i>
          <Icon className="icon" size={19} />
        </i>
      </div>
      <strong className="count-up">{value}</strong>
      <small>{note}</small>
    </article>
  )
}

export function AdminInventory() {
  const linked = useSearchParams()
  const [search, setSearch] = useState(linked.get("search") ?? "")
  const [stock, setStock] = useState<"" | "low" | "out" | "in">(
    (["low", "out", "in"] as const).find((s) => s === linked.get("stock")) ?? "",
  )
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Product | null>(null)
  const summary = useInventorySummary()
  const products = useProducts({
    search: search.trim() || undefined,
    stock: stock || undefined,
    page,
    pageSize: PAGE_SIZE,
  })
  const s = summary.data
  const total = products.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const n = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString("en-IN"))

  return (
    <div className="gk-page">
      <PageHeader
        title="Products & inventory"
        subtitle="Stock for products sold by GLOARO MART sellers in your zones."
        note={<span className="live-note">● Live data</span>}
      />
      <div className="metrics-grid">
        <Tile
          label="Products"
          value={n(s?.products)}
          note={`${n(s?.active)} active`}
          icon={Boxes}
        />
        <Tile
          label="Low stock"
          value={n(s?.lowStock)}
          note="At or below the alert level"
          icon={AlertTriangle}
          tone="gold"
        />
        <Tile
          label="Out of stock"
          value={n(s?.outOfStock)}
          note="Not available to customers"
          icon={PackageX}
          tone="red"
        />
        <Tile
          label="Stock value"
          value={s ? formatINR(s.stockValuePaise) : "—"}
          note="Units on hand × price"
          icon={Wallet}
        />
      </div>
      <section className="panel full-panel">
        <div className="toolbar">
          <div className="search-field">
            <Search className="icon" size={17} />
            <input
              placeholder="Search product, SKU or category…"
              value={search}
              onChange={(e) => (setSearch(e.target.value), setPage(1))}
              aria-label="Search products"
            />
          </div>
          {(["", "low", "out", "in"] as const).map((v) => (
            <button
              key={v || "all"}
              type="button"
              className={`filter-button${stock === v ? " active" : ""}`}
              aria-pressed={stock === v}
              onClick={() => (setStock(v), setPage(1))}
            >
              {v === ""
                ? "All"
                : v === "low"
                  ? "Low stock"
                  : v === "out"
                    ? "Out of stock"
                    : "In stock"}
            </button>
          ))}
        </div>
        {products.isError ? (
          <p className="admin-error" role="alert">
            <AlertTriangle className="icon" size={16} />
            {products.error instanceof ApiError
              ? products.error.message
              : "Couldn't load products."}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Seller</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {products.data?.items.map((p, i) => {
                  const state = stockState(p)
                  const pct = Math.min(100, (p.stock / Math.max(1, p.lowStockThreshold * 4)) * 100)
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className="gk-row"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <td>
                        <button
                          type="button"
                          onClick={(e) => (e.stopPropagation(), setSelected(p))}
                          style={{ all: "unset", cursor: "pointer" }}
                        >
                          <strong>{p.name}</strong>
                        </button>
                        <small>{p.sku}</small>
                      </td>
                      <td>
                        <strong className="vendor-name">{p.vendorName}</strong>
                      </td>
                      <td>{p.category}</td>
                      <td>
                        <strong>{formatINR(p.pricePaise)}</strong>
                      </td>
                      <td>
                        <span className={`stock-meter ${state}`}>
                          <b>{p.stock}</b>
                          <i>
                            <em style={{ width: `${pct}%` }} />
                          </i>
                        </span>
                      </td>
                      <td>
                        <AdminBadge tone={p.status === "paused" ? "neutral" : stockTone[state]}>
                          {p.status === "paused" ? "Paused" : stockText(p)}
                        </AdminBadge>
                      </td>
                    </tr>
                  )
                })}
                {products.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={6}>No products match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            Showing {products.data?.items.length ?? 0} of {total} products
          </span>
          <div>
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <b>{page}</b>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </div>
      </section>
      {selected && (
        <StockDrawer
          // Re-read the row after a change so the drawer shows the new version.
          product={products.data?.items.find((p) => p.id === selected.id) ?? selected}
          close={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function StockDrawer({ product: p, close }: { product: Product; close: () => void }) {
  const me = useMe()
  const canManage = Boolean(me.data?.permissions.includes("inventory.manage"))
  const adjust = useAdjustStock()
  const status = useProductStatus()
  const [change, setChange] = useState(10)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [reason, setReason] = useState<(typeof STOCK_REASONS)[number]>("restock")
  const after = p.stock + direction * change
  const error = adjust.error ?? status.error
  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Overlay className="drawer-backdrop">
        <Dialog.Content className="drawer" aria-describedby={undefined}>
          <div className="drawer-head">
            <div>
              <small>{p.sku}</small>
              <Dialog.Title asChild>
                <h2>{p.name}</h2>
              </Dialog.Title>
            </div>
            <Dialog.Close aria-label="Close">
              <X className="icon" size={20} />
            </Dialog.Close>
          </div>
          <div className="drawer-status">
            <AdminBadge tone={p.status === "paused" ? "neutral" : stockTone[stockState(p)]}>
              {p.status === "paused" ? "Paused" : stockText(p)}
            </AdminBadge>
            <span>
              {p.vendorName} · {p.category}
            </span>
          </div>
          <div className="stock-hero">
            <div>
              <small>On hand</small>
              <strong>{p.stock}</strong>
              <span>Alert at {p.lowStockThreshold} or fewer</span>
            </div>
            <div>
              <small>Price</small>
              <strong>{formatINR(p.pricePaise)}</strong>
              <span>Value {formatINR(Math.max(0, p.stock) * p.pricePaise)}</span>
            </div>
          </div>
          {canManage ? (
            <form
              method="post"
              className="stock-form"
              onSubmit={(e) => {
                e.preventDefault()
                adjust.mutate(
                  { p, change: direction * change, reason },
                  { onSuccess: () => setChange(10) },
                )
              }}
            >
              <h3>Change stock</h3>
              <div className="stock-direction" role="radiogroup" aria-label="Add or remove">
                <button
                  type="button"
                  role="radio"
                  aria-checked={direction === 1}
                  className={direction === 1 ? "active" : ""}
                  onClick={() => (setDirection(1), setReason("restock"))}
                >
                  <Plus className="icon" size={15} /> Add
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={direction === -1}
                  className={direction === -1 ? "active" : ""}
                  onClick={() => (setDirection(-1), setReason("sold_offline"))}
                >
                  <Minus className="icon" size={15} /> Remove
                </button>
              </div>
              <label>
                <span>Units</span>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={change}
                  onChange={(e) => setChange(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label>
                <span>Reason</span>
                <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                  {STOCK_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {reasonLabel[r]}
                    </option>
                  ))}
                </select>
              </label>
              <p className={`stock-preview${after < 0 ? " bad" : ""}`}>
                {p.stock} → <b>{after}</b> units
                {after < 0 && " — that's more than is in stock"}
              </p>
              <AdminButton type="submit" disabled={adjust.isPending || after < 0}>
                {adjust.isPending ? "Saving…" : "Save stock change"}
              </AdminButton>
              <AdminButton
                kind="secondary"
                icon={p.status === "paused" ? Play : Pause}
                disabled={status.isPending}
                onClick={() =>
                  status.mutate({ p, status: p.status === "paused" ? "active" : "paused" })
                }
              >
                {p.status === "paused" ? "Make available again" : "Pause this product"}
              </AdminButton>
              {error && (
                <p className="admin-error" role="alert">
                  <AlertTriangle className="icon" size={16} />
                  {error instanceof ApiError ? error.message : "Couldn't save. Try again."}
                </p>
              )}
              {adjust.isSuccess && !error && (
                <p className="admin-notice">Stock updated and recorded in the audit log.</p>
              )}
            </form>
          ) : (
            <p className="admin-empty">You can view stock but not change it.</p>
          )}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  )
}
