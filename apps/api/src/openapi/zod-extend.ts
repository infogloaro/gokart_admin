// Must be the first import in every API entry point (server, scripts, tests):
// Zod 4 attaches methods when a schema is created, so .openapi() only exists on
// schemas defined after this runs — including those in packages/shared.
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi"
import { z } from "zod"

extendZodWithOpenApi(z)
