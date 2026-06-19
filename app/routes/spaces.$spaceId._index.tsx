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
          {/* ゲーム */}
          <Link
            to={`/rooms/new?spaceId=${space.id}`}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow p-6 transition-colors block"
          >
            <h2 className="text-lg font-semibold mb-1">🃏 ゲームを始める</h2>
            <p className="text-sm text-indigo-100">新しいルームを作成して招待コードを発行</p>
          </Link>

          <Link
            to="/rooms/join"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow block"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-1">🔑 ゲームに参加</h2>
            <p className="text-sm text-gray-600">招待コードを入力して参加</p>
          </Link>

          {/* 管理（admin のみ） */}
          {isAdmin && (
            <>
              <Link
                to={`/spaces/${space.id}/admin/cards`}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow block"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-1">📝 カード管理</h2>
                <p className="text-sm text-gray-600">価値観カードの追加・編集・デッキ設定</p>
              </Link>

              <Link
                to={`/spaces/${space.id}/invite`}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow block"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-1">👥 メンバーを招待</h2>
                <p className="text-sm text-gray-600">メールアドレスで招待</p>
              </Link>
            </>
          )}

          <Link
            to={`/spaces/${space.id}/members`}
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow block"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-1">👤 メンバー一覧</h2>
            <p className="text-sm text-gray-600">スペースのメンバーを確認</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
