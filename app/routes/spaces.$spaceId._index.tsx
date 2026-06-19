import { redirect } from "react-router";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/spaces.$spaceId._index";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { broadcastRoomEvent } from "~/lib/broadcast.server";

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

  // スペース内のアクティブルームを取得（waiting または playing）
  const activeRooms = await db.query.rooms.findMany({
    where: (r, { and, eq, or }) =>
      and(
        eq(r.spaceId, spaceId),
        or(eq(r.status, "waiting"), eq(r.status, "playing")),
      ),
    with: {
      players: true,
    },
    limit: 5,
  });

  return { user, space, role: membership.role, activeRooms };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "join") {
    const inviteCode = formData.get("inviteCode");
    if (typeof inviteCode !== "string" || !inviteCode.trim()) {
      return { error: "招待コードを入力してください" };
    }

    const db = drizzle(context.cloudflare.env.DB, { schema });

    // 招待コードでルームを検索
    const room = await db.query.rooms.findFirst({
      where: (r, { eq }) => eq(r.inviteCode, inviteCode.trim().toUpperCase()),
    });

    if (!room) {
      return { error: "招待コードが正しくないか、参加権限がありません" };
    }

    // スペースメンバーチェック
    const membership = await db.query.spaceMembers.findFirst({
      where: (m, { and, eq }) =>
        and(eq(m.spaceId, room.spaceId), eq(m.userId, user.id)),
    });

    if (!membership) {
      return { error: "招待コードが正しくないか、参加権限がありません" };
    }

    if (room.status !== "waiting") {
      return { error: "このルームはすでに開始されています" };
    }

    const currentPlayers = await db.query.roomPlayers.findMany({
      where: (rp, { eq }) => eq(rp.roomId, room.id),
    });

    if (currentPlayers.length >= 8) {
      return { error: "ルームは最大8人までです" };
    }

    // すでに参加しているかチェック
    const alreadyJoined = currentPlayers.some((p) => p.userId === user.id);
    if (alreadyJoined) {
      throw redirect(`/rooms/${room.id}`);
    }

    // 名前の重複チェック
    const nameDuplicate = currentPlayers.some(
      (p) => p.name.toLowerCase() === user.name.toLowerCase(),
    );

    if (nameDuplicate) {
      return { error: "このルームで同じ名前のプレイヤーがすでに参加しています" };
    }

    const now = new Date();
    await db.insert(schema.roomPlayers).values({
      id: crypto.randomUUID(),
      roomId: room.id,
      userId: user.id,
      name: user.name,
      seatOrder: currentPlayers.length + 1,
      joinedAt: now,
    });

    // 参加後にブロードキャスト
    const updatedPlayers = await db.query.roomPlayers.findMany({
      where: (rp, { eq }) => eq(rp.roomId, room.id),
      orderBy: (rp, { asc }) => asc(rp.seatOrder),
    });
    await broadcastRoomEvent(context.cloudflare.env, room.id, {
      type: "room.updated",
      roomId: room.id,
      players: updatedPlayers.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        seatOrder: p.seatOrder,
      })),
    });

    throw redirect(`/rooms/${room.id}`);
  }

  return { error: "不正なリクエストです" };
}

export default function SpaceHub({ loaderData, actionData }: Route.ComponentProps) {
  const { user, space, role, activeRooms } = loaderData;
  const isAdmin = role === "admin";
  const navigation = useNavigation();
  const isJoining = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/spaces" className="text-lg font-bold text-indigo-600">
            Align
          </a>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user.name}</span>
            <a
              href="/logout"
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1 rounded-md"
            >
              ログアウト
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        {/* パンくず */}
        <div>
          <a href="/spaces" className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
            &larr; スペース一覧
          </a>
        </div>

        {/* スペース名 */}
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900">{space.name}</h1>
          {isAdmin && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
              管理者
            </span>
          )}
        </div>

        {/* アクティブなゲーム */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            アクティブなゲーム
          </h2>
          {activeRooms.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center">
              <p className="text-gray-400 text-sm">現在進行中のゲームはありません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeRooms.map((room) => (
                <a
                  key={room.id}
                  href={`/rooms/${room.id}`}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-shadow block"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-indigo-600 tracking-widest">
                      {room.inviteCode}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {room.players.length} 人参加中
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      room.status === "waiting"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {room.status === "waiting" ? "待機中" : "プレイ中"}
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* ゲームに参加 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            ゲームに参加
          </h2>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
            {/* 新しいゲームを始める */}
            <a
              href={`/rooms/new?spaceId=${space.id}`}
              className="w-full flex items-center justify-between bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-4 font-semibold transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="text-xl">🃏</span>
                新しいゲームを始める
              </span>
              <span className="text-indigo-200">→</span>
            </a>

            {/* 招待コードで参加 */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">招待コードで参加</p>
              {actionData?.error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
                  {actionData.error}
                </div>
              )}
              <Form method="post" className="flex gap-2">
                <input type="hidden" name="intent" value="join" />
                <input
                  name="inviteCode"
                  placeholder="ABC123"
                  maxLength={6}
                  required
                  className="flex-1 uppercase tracking-widest font-mono text-center border-2 border-gray-200 rounded-lg px-3 py-3 text-lg focus:outline-none focus:border-indigo-400"
                  style={{ textTransform: "uppercase" }}
                />
                <button
                  type="submit"
                  disabled={isJoining}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {isJoining ? "参加中..." : "参加"}
                </button>
              </Form>
              <p className="text-xs text-gray-400 mt-1">招待コードは6文字英数字</p>
            </div>
          </div>
        </section>

        {/* スペース管理（adminのみ） */}
        {isAdmin && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              スペース管理
            </h2>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex flex-wrap gap-3">
                <a
                  href={`/spaces/${space.id}/admin/cards`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                >
                  📝 カード管理
                </a>
                <a
                  href={`/spaces/${space.id}/invite`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                >
                  ✉️ メンバー招待
                </a>
                <a
                  href={`/spaces/${space.id}/members`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                >
                  👥 メンバー一覧
                </a>
              </div>
            </div>
          </section>
        )}

        {/* 非admin向けメンバー一覧リンク */}
        {!isAdmin && (
          <div>
            <a
              href={`/spaces/${space.id}/members`}
              className="text-sm text-indigo-600 hover:underline"
            >
              メンバー一覧を見る →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
