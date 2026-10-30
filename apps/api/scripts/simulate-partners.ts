// Development only: plays the partner app for every approved partner who is on shift in the
// seed (available or on a delivery). Each one sends a GPS fix through the intake API every
// few seconds, wandering around their zone, so Live tracking and the dashboards stay live.
//
//   pnpm --filter @zoauro/api simulate        (with the API running on :4000)
import { prisma } from "../src/lib/prisma"

const API = process.env.API_URL ?? "http://localhost:4000/api/v1"
const KEY = process.env.INTAKE_KEY ?? "dev-intake-key-not-for-production"
const EVERY_MS = 10_000

let shifted = false

async function intake(path: string, body: unknown) {
  try {
    const res = await fetch(`${API}/intake${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-intake-key": KEY },
      body: JSON.stringify(body),
    })
    // Off shift (after a re-seed, or the stale sweep): start shifts again next tick.
    if (res.status === 400 && path.endsWith("/location")) shifted = false
    else if (!res.ok && res.status !== 409)
      console.warn(`${path} → ${res.status} ${await res.text()}`)
    return res.ok
  } catch {
    // The API restarts while you edit code (node --watch); keep going and retry next tick.
    shifted = false
    return false
  }
}

const partners = await prisma.partner.findMany({
  where: { status: "active", availability: { in: ["available", "on_delivery"] } },
  include: { zone: { select: { lat: true, lng: true, location: true } } },
})
await prisma.$disconnect()

// Chennai centre when a zone has no coordinates yet.
const walkers = partners.map((p, i) => ({
  code: p.code,
  name: p.name,
  lat: (p.zone.lat ?? 13.0827) + Math.sin(i * 2.1) * 0.01,
  lng: (p.zone.lng ?? 80.2707) + Math.cos(i * 2.1) * 0.01,
  heading: (i * 47) % 360,
}))

console.info(`Simulating ${walkers.length} partners every ${EVERY_MS / 1000}s. Ctrl+C to stop.`)

async function tick() {
  // (Re)start shifts on the first tick and after the API comes back.
  if (!shifted) {
    shifted = true
    for (const w of walkers) await intake(`/partners/${w.code}/shift`, { action: "start" })
  }
  for (const w of walkers) {
    // About 25 km/h, turning a little each step.
    w.heading = (w.heading + (Math.random() - 0.5) * 50 + 360) % 360
    const step = 0.0007
    w.lat += Math.cos((w.heading * Math.PI) / 180) * step
    w.lng += Math.sin((w.heading * Math.PI) / 180) * step
    await intake(`/partners/${w.code}/location`, {
      lat: Number(w.lat.toFixed(6)),
      lng: Number(w.lng.toFixed(6)),
      speedKmh: 18 + Math.round(Math.random() * 14),
      heading: Math.round(w.heading),
    })
  }
}

await tick()
const timer = setInterval(() => void tick(), EVERY_MS)
process.on("SIGINT", () => {
  clearInterval(timer)
  process.exit(0)
})
