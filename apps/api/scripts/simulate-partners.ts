// Development only: plays the partner app for every approved partner who is on shift in the
// seed (available or on a delivery). Each one sends a GPS fix through the intake API every
// few seconds, riding around near their zone, so Live tracking and the dashboards stay live.
//
//   pnpm --filter @zoauro/api simulate        (with the API running on :4000)
//
// It also answers on http://localhost:4100 so a dev process manager can see it is running.
import { createServer } from "node:http"
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

/** How far (in degrees, about 700 m) a partner rides from home before turning back. */
const LEASH = 0.0065
// Home is a little inland (west) of the zone centre: several Chennai zones sit on the
// coast, and a partner wandering east from there would end up in the sea.
const walkers = partners.map((p, i) => {
  const homeLat = (p.zone.lat ?? 13.0827) + Math.sin(i * 2.1) * 0.003
  const homeLng = (p.zone.lng ?? 80.2707) - 0.004 - Math.abs(Math.cos(i * 2.1)) * 0.003
  return {
    code: p.code,
    name: p.name,
    homeLat,
    homeLng,
    lat: homeLat,
    lng: homeLng,
    heading: (i * 47) % 360,
  }
})

/** Compass bearing from one point to another, in degrees. */
const bearing = (fromLat: number, fromLng: number, toLat: number, toLng: number) =>
  ((Math.atan2(toLng - fromLng, toLat - fromLat) * 180) / Math.PI + 360) % 360

console.info(`Simulating ${walkers.length} partners every ${EVERY_MS / 1000}s. Ctrl+C to stop.`)

async function tick() {
  // (Re)start shifts on the first tick and after the API comes back.
  if (!shifted) {
    shifted = true
    for (const w of walkers) await intake(`/partners/${w.code}/shift`, { action: "start" })
  }
  for (const w of walkers) {
    // About 25 km/h, turning a little each step; past the leash, or drifting east of
    // home toward the coast, head back toward home.
    const away = Math.hypot(w.lat - w.homeLat, w.lng - w.homeLng)
    if (away > LEASH || w.lng > w.homeLng + LEASH / 2)
      w.heading =
        (bearing(w.lat, w.lng, w.homeLat, w.homeLng) + (Math.random() - 0.5) * 30 + 360) % 360
    else w.heading = (w.heading + (Math.random() - 0.5) * 50 + 360) % 360
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
const status = createServer((_req, res) => {
  res.setHeader("content-type", "application/json")
  res.end(JSON.stringify({ partners: walkers.length, everySeconds: EVERY_MS / 1000 }))
}).listen(Number(process.env.SIMULATOR_PORT ?? 4100))
process.on("SIGINT", () => {
  clearInterval(timer)
  status.close()
  process.exit(0)
})
