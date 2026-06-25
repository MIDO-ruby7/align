import type { Route } from "./+types/api.auth.$";
import { createAuth } from "../lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const auth = createAuth(context.cloudflare.env);
  return auth.handler(request);
}

export async function action({ request, context }: Route.ActionArgs) {
  const auth = createAuth(context.cloudflare.env);
  return auth.handler(request);
}
