import { redirect } from "react-router";
import type { Route } from "./+types/rooms._index";
import { requireUser } from "~/lib/session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context);
  throw redirect("/spaces");
}

export default function RoomsIndex() {
  return null;
}
