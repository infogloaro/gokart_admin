import nodemailer from "nodemailer"
import { env } from "../config/env"

// Mailpit locally (inbox at http://localhost:8025); Amazon SES later.
const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
})

export async function sendMail(to: string, subject: string, text: string, html?: string) {
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text, html })
}
