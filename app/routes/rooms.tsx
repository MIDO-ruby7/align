import { Outlet } from "react-router";
import type { Route } from "./+types/rooms";
import { requireUser } from "~/lib/session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  return { user };
}

export default function RoomsLayout() {
  return <Outlet />;
}
