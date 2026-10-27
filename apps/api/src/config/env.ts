import { z } from "zod"

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(24, "SESSION_SECRET must be at least 24 characters"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  MAIL_FROM: z.string().default("GoKart Admin <no-reply@gokart.local>"),
  // SMS: "dev" puts messages in the Mailpit inbox; "msg91" sends real SMS (needs DLT approval).
  SMS_PROVIDER: z.enum(["dev", "msg91"]).default("dev"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("ap-south-1"),
  S3_BUCKET: z.string().default("gokart-dev"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  // Shared secret the partner app sends as x-intake-key.
  INTAKE_KEY: z.string().min(16).optional(),
})

const parsed = Env.safeParse(process.env)
if (!parsed.success) {
  console.error("Invalid environment variables:\n" + z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
export const isProd = env.NODE_ENV === "production"
if (isProd && !env.INTAKE_KEY) {
  console.error("INTAKE_KEY is required in production.")
  process.exit(1)
}
/** Development and tests fall back to a fixed key. */
export const intakeKey = env.INTAKE_KEY ?? "dev-intake-key-not-for-production"
