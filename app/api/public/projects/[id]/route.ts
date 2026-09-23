import "server-only";

import { publicJson } from "@/server/http/public-json";
import { withPublicSession } from "@/server/http/require-public-session";
import { findProject } from "@/server/services/project-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withPublicSession(request, async () => {
    const { id } = await context.params;
    const project = await findProject(id);
    if (!project) return publicJson({ error: "not_found" }, 404);
    return publicJson(project);
  });
}
