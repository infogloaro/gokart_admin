// Left side of the sign-in screen ("Bento Command"): a grid of brand tiles.
// Decorative only, so no business numbers are shown before sign-in.
import { Bike, ShoppingBag, UtensilsCrossed } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

function Tile({
  className,
  delay,
  children,
}: {
  className: string
  delay: number
  children: ReactNode
}) {
  return (
    <div
      className={`bento-tile flex rounded-[22px] ${className}`}
      style={{ animationDelay: `${delay}s` } as CSSProperties}
    >
      {children}
    </div>
  )
}

const dot = (delay: number, on = true) => (
  <i
    className={`size-2.5 rounded-full ${on ? "bento-dot bg-gold" : "bg-[#2c4b7a]"}`}
    style={{ animationDelay: `${delay}s` }}
  />
)

export function LoginBento() {
  return (
    <section
      aria-label="GoKart"
      className="login-bento-panel grid grid-cols-3 grid-rows-[72px_repeat(3,minmax(0,1fr))] gap-3.5 bg-navy-2 p-7 font-sans"
    >
      <div className="col-span-3 flex items-center gap-3 text-white">
        <div className="grid size-10 -rotate-[7deg] place-items-center rounded-xl bg-gold text-xl font-extrabold text-navy-2">
          G
        </div>
        <div className="font-bold tracking-[0.12em]">
          GO<span className="text-gold">KART</span>
        </div>
        <span className="ml-auto text-xs text-[#8ea0bb]">Operations console</span>
      </div>

      <Tile
        delay={0}
        className="relative col-span-2 row-span-2 flex-col justify-end gap-3 overflow-hidden bg-[#0b2c5c] p-8 text-white"
      >
        <div
          aria-hidden="true"
          className="absolute -top-16 -right-16 size-72 rounded-full border-[40px] border-gold/20"
        />
        <span className="text-xs font-bold tracking-[0.16em] text-gold-light">
          UNIFIED COMMERCE OPERATIONS
        </span>
        <div className="text-[clamp(2rem,3.4vw,2.9rem)] leading-[1.02] font-extrabold tracking-[-0.045em]">
          Two businesses.
          <br />
          One console.
        </div>
        <p className="m-0 max-w-[34ch] text-[15px] leading-relaxed text-[#b9c8db]">
          Orders, partners, payouts and approvals for food delivery and the marketplace, in one
          place.
        </p>
      </Tile>

      <Tile delay={0.1} className="flex-col justify-between bg-gold p-5 text-navy-2">
        <UtensilsCrossed size={30} aria-hidden="true" />
        <div>
          <b className="block text-lg">ZOAURO FOOD</b>
          <span className="text-[13px]">Food delivery</span>
        </div>
      </Tile>

      <Tile delay={0.2} className="flex-col justify-between bg-[#eef3ff] p-5 text-[#0b2c5c]">
        <ShoppingBag size={30} aria-hidden="true" />
        <div>
          <b className="block text-lg">GLOARO MART</b>
          <span className="text-[13px]">Marketplace</span>
        </div>
      </Tile>

      <Tile delay={0.3} className="flex-col gap-3.5 bg-[#0b2c5c] p-5 text-white">
        <span className="text-xs font-bold tracking-[0.14em] text-gold-light">TWO-STEP</span>
        <div className="flex flex-col gap-2 text-sm">
          {["Email code", "SMS to mobile", "Authenticator app"].map((m, i) => (
            <span key={m} className="flex items-center gap-2">
              <i
                className="bento-dot size-2 rounded-full bg-[#4ade80]"
                style={{ animationDelay: `${i * 0.8}s` }}
              />
              {m}
            </span>
          ))}
        </div>
      </Tile>

      <Tile delay={0.4} className="col-span-2 items-center gap-5 bg-[#0b2c5c] px-6 py-5 text-white">
        <div aria-hidden="true" className="grid grid-cols-6 gap-2">
          {dot(0)}
          {dot(0, false)}
          {dot(0.6)}
          {dot(0, false)}
          {dot(0, false)}
          {dot(1.2)}
          {dot(0, false)}
          {dot(0.3)}
          {dot(0, false)}
          {dot(1.6)}
          {dot(0, false)}
          {dot(0, false)}
        </div>
        <div className="min-w-0">
          <b className="flex items-center gap-2 text-base">
            <Bike size={18} aria-hidden="true" className="text-gold" />
            Service zones across Tamil Nadu
          </b>
          <span className="text-[13px] text-[#b9c8db]">Each admin sees only their own zones</span>
        </div>
      </Tile>
    </section>
  )
}
