# Partner app intake API

How the delivery partner app reports shifts, GPS locations and order progress to the
GoKart API. The Super Admin and Admin portals show this live on their tracking maps.
The full schemas are in `apps/api/openapi/openapi.json` under the tag
"Intake (partner app)".

## Authentication

Every request sends the shared key in a header:

```
x-intake-key: <INTAKE_KEY>
```

`INTAKE_KEY` is set in the API's environment (at least 16 characters, required in
production). In development the API falls back to `dev-intake-key-not-for-production`.
Wrong or missing key → `401`.

Partners are identified by their partner code (for example `DP-2381`), which the portals
show on every partner. Only approved partners can use these endpoints (`403` otherwise).

Base URL: `https://<api-host>/api/v1/intake`

## Endpoints

### Start or end a shift

`POST /partners/{code}/shift`

```json
{ "action": "start" }
```

`start` → the partner is online: `available`, or `on_delivery` if they still carry an
order. `end` → `offline`. Ending a shift while carrying an order returns `400`.

Response: `{ "code": "DP-2381", "availability": "available" }`

### Send a location

`POST /partners/{code}/location`, every 5 to 10 seconds while on shift.

```json
{ "lat": 13.0418, "lng": 80.2341, "speedKmh": 22, "heading": 90, "at": "2026-10-27T10:15:00Z" }
```

`speedKmh`, `heading` (degrees from north) and `at` (ISO time of the fix) are optional;
`at` defaults to when the API receives it. Sending before starting a shift returns `400`.

Response: `202 { "received": true }`. The latest position is kept in Redis, the trail in
Postgres, and both portals receive it over Socket.IO within a second.

**No location for 3 minutes** → a partner who is `available` is marked `offline`
automatically. A partner who is `on_delivery` keeps that status; the portals show how long
ago they were last seen.

### Accept an order, or report progress

`POST /orders/{orderCode}/status`

```json
{ "partnerCode": "DP-2381", "to": "assigned" }
```

| `to`               | Meaning                                  | Rules                                                     |
| ------------------ | ---------------------------------------- | --------------------------------------------------------- |
| `assigned`         | Partner accepts a ready order            | Partner is `available`, same business and service area    |
| `picked_up`        | Collected from the restaurant or seller  | Order is assigned to this partner                         |
| `out_for_delivery` | On the way to the customer               | Order was picked up                                       |
| `delivered`        | Handed to the customer                   | Order is out for delivery                                 |

Response: `{ "code": "ZOF-88219", "status": "picked_up" }`. Accepting an order taken by
someone else returns `409`.

Availability follows orders automatically: carrying any assigned, picked-up or
out-for-delivery order → `on_delivery`; none left → `available`.

## Statuses the portals show

| Availability  | Portal label | Set by                                                        |
| ------------- | ------------ | ------------------------------------------------------------- |
| `available`   | Online       | Shift start, last order delivered, or an Admin                |
| `on_delivery` | On delivery  | Orders only (never set by hand)                               |
| `offline`     | Offline      | Shift end, 3 minutes without a location, suspension, or an Admin |

Admins (for partners in their zones) and Super Admins (for everyone) can set a partner
Online or Offline from the portals with a reason. Each change is recorded in the audit
log. A partner who is on a delivery can't be taken offline by hand.

## Errors

All errors look like:

```json
{ "error": { "code": "bad_request", "message": "Start a shift before sending locations.", "fields": { "shift": ["Offline"] } } }
```

## Try it locally

```bash
curl -X POST http://localhost:4000/api/v1/intake/partners/DP-1042/shift \
  -H "x-intake-key: dev-intake-key-not-for-production" -H "Content-Type: application/json" \
  -d '{"action":"start"}'
```

```bash
curl -X POST http://localhost:4000/api/v1/intake/partners/DP-1042/location \
  -H "x-intake-key: dev-intake-key-not-for-production" -H "Content-Type: application/json" \
  -d '{"lat":13.0418,"lng":80.2341,"speedKmh":18}'
```

Then open Live tracking in either portal: the pin appears and moves with each location.
