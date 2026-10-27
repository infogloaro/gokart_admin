import type { Request, Response, NextFunction, RequestHandler } from "express"
import { parseWorkspaceId } from "./workspace.validation.js"
import type { createWorkspaceService } from "./workspace.service.js"
import type { WorkspacePrincipal } from "./workspace.types.js"

type WorkspaceService = ReturnType<typeof createWorkspaceService>

export function createWorkspaceController(
  service: WorkspaceService,
  getPrincipal: (req: Request) => WorkspacePrincipal | null,
) {
  const handle =
    (action: (req: Request, principal: WorkspacePrincipal) => Promise<unknown>): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
      const principal = getPrincipal(req)

      if (!principal?.userId) {
        res.status(401).json({
          error: { message: "Authentication required" },
        })
        return
      }

      void action(req, principal)
        .then((data) => res.status(200).json({ data }))
        .catch(next)
    }

  return {
    list: handle((_req, principal) => service.listWorkspaces(principal)),

    getActive: handle((_req, principal) => service.getActiveWorkspace(principal)),

    setActive: handle((req, principal) => {
      const { workspaceId } = parseWorkspaceId(req.body)

      return service.setActiveWorkspace(principal, workspaceId)
    }),
  }
}
