import { Router } from "express"
import { requireAuth } from "../../middleware/auth"
import * as account from "./account"
import * as c from "./auth.controller"

export const authRoutes = Router()
  .post("/login", c.login)
  .post("/send-code", c.sendCode)
  .post("/verify", c.verify)
  .post("/verify-recovery", c.verifyRecovery)
  .post("/resend", c.resend)
  .post("/forgot-password", c.forgotPassword)
  .post("/logout", requireAuth, c.logout)
  .get("/me", requireAuth, c.me)
  .post("/totp/setup", requireAuth, c.totpSetup)
  .post("/totp/confirm", requireAuth, c.totpConfirm)
  .post("/totp/recovery-codes", requireAuth, c.regenerateRecoveryCodes)
  .post("/totp/disable", requireAuth, c.totpDisable)
  .get("/sessions", requireAuth, account.sessions)
  .post("/sessions/end-others", requireAuth, account.endOtherSessions)
  .delete("/sessions/:id", requireAuth, account.endSession)
  .get("/preferences", requireAuth, account.preferences)
  .put("/preferences", requireAuth, account.savePreferences)
