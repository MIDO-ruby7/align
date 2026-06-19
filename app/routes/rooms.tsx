// NOTE: 子ルートは T4（スペース管理）と T5（ルーム）で routes.ts に追加される。
// このファイル自体は認証ガードの layout として機能する。
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
