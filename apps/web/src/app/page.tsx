import { redirect } from "next/navigation"

// The request proxy sends signed-in members to /workspace before this runs.
export default function Home() {
  redirect("/login")
}
