import { redirect, data } from "react-router";
import type { Route } from "./+types/logout";
import { createAuth } from "~/lib/auth.server";

export async function loader() {
  throw redirect("/login");
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method Not Allowed" }, { status: 405 });
  }

  const auth = createAuth(context.cloudflare.env);

  try {
    const result = await auth.api.signOut({
      headers: request.headers,
      asResponse: true,
    });

    const setCookie = result.headers.get("set-cookie");
    const headers = new Headers();
    if (setCookie) {
      headers.set("set-cookie", setCookie);
    }
    headers.set("location", "/login");
    return new Response(null, { status: 302, headers });
  } catch {
    throw redirect("/login");
  }
}
