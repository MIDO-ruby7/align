import { Link } from "react-router";
import type { Route } from "./+types/spaces.$spaceId._index";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.space?.name ?? "スペース"} - Align` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const spaceId = params.spaceId;

  const db = drizzle(context.cloudflare.env.DB, { schema });

  // スペースへの所属確認（他スペースへのアクセス防止）
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) => and(eq(m.spaceId, spaceId), eq(m.userId, user.id)),
  });

  if (!membership) {
    throw new Response("Not Found", { status: 404 });
  }

  const space = await db.query.spaces.findFirst({
    where: (s, { eq }) => eq(s.id, spaceId),
  });

  if (!space) {
    throw new Response("Not Found", { status: 404 });
  }

  return { user, space, role: membership.role };
}

export default function SpaceHome({ loaderData }: Route.ComponentProps) {
  const { user, space, role } = loaderData;
  const isAdmin = role === "admin";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="mb-6">
          <a href="/spaces" className="text-sm text-indigo-600 hover:underline">
            &larr; スペース一覧に戻る
          </a>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{space.name}</h1>
              <p className="text-sm text-gray-600 mt-1">
                ログイン中: {user.name}（
                {isAdmin ? "管理者" : "メンバー"}）
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to={`/spaces/${space.id}/members`}
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow block"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              メンバー管理
            </h2>
            <p className="text-sm text-gray-600">メンバー一覧の確認</p>
          </Link>

          {isAdmin && (
            <Link
              to={`/spaces/${space.id}/invite`}
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow block"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                メンバーを招待
              </h2>
              <p className="text-sm text-gray-600">メールアドレスで招待</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
