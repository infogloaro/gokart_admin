import type { Metadata } from "next"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Sign in · GoKart Admin" }

export default function LoginPage() {
  return (
    <div className="super-ui">
      <LoginForm />
    </div>
  )
}
