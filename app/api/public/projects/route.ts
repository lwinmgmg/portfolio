import "server-only";

import { publicJson } from "@/server/http/public-json";
import { withPublicSession } from "@/server/http/require-public-session";
import { listProjects } from "@/server/services/project-service";

export async function GET(request: Request) {
  return withPublicSession(request, async () => publicJson(await listProjects()));
}
