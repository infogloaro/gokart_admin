import "dotenv/config"

import { createApp } from "./app.js"
import { env } from "./env.js"

const app = createApp()

app.listen(env.PORT, () => {
  console.log(`@zoauro/api listening on :${env.PORT}`)
})
