import { redirect, data } from "react-router";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/rooms.join";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";

export function meta() {
  return [{ title: "ルームに参加 - Align" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context);
  return {};
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const inviteCode = formData.get("inviteCode");
  const playerName = formData.get("playerName");

  if (typeof inviteCode !== "string" || !inviteCode.trim()) {
    return data({ error: "招待コードを入力してください" }, { status: 400 });
  }

  if (typeof playerName !== "string" || !playerName.trim()) {
    return data({ error: "プレイヤー名を入力してください" }, { status: 400 });
  }

  if (playerName.trim().length > 50) {
    return data({ error: "プレイヤー名は50文字以内で入力してください" }, { status: 400 });
  }

  const db = drizzle(context.cloudflare.env.DB, { schema });

  // 招待コードでルームを検索
  const room = await db.query.rooms.findFirst({
    where: (r, { eq }) => eq(r.inviteCode, inviteCode.trim().toUpperCase()),
  });

  if (!room) {
    return data({ error: "招待コードが正しくないか、参加権限がありません" }, { status: 400 });
  }

  // スペースメンバーチェック
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.spaceId, room.spaceId), eq(m.userId, user.id)),
  });

  if (!membership) {
    return data({ error: "招待コードが正しくないか、参加権限がありません" }, { status: 400 });
  }

  // ルームのステータスチェック
  if (room.status !== "waiting") {
    return data({ error: "このルームはすでに開始されています" }, { status: 400 });
  }

  // 現在のプレイヤー数チェック
  const currentPlayers = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.roomId, room.id),
  });

  if (currentPlayers.length >= 8) {
    return data({ error: "ルームは最大8人までです" }, { status: 409 });
  }

  // 名前の重複チェック
  const nameDuplicate = currentPlayers.some(
    (p) => p.name.toLowerCase() === playerName.trim().toLowerCase(),
  );

  if (nameDuplicate) {
    return data(
      { error: "このルームで同じ名前のプレイヤーがすでに参加しています" },
      { status: 409 },
    );
  }

  // すでに参加しているかチェック
  const alreadyJoined = currentPlayers.some((p) => p.userId === user.id);
  if (alreadyJoined) {
    // すでに参加済みならそのままロビーへ
    throw redirect(`/rooms/${room.id}`);
  }

  const now = new Date();
  await db.insert(schema.roomPlayers).values({
    id: crypto.randomUUID(),
    roomId: room.id,
    userId: user.id,
    name: playerName.trim(),
    seatOrder: currentPlayers.length + 1,
    joinedAt: now,
  });

  throw redirect(`/rooms/${room.id}`);
}

export default function RoomsJoin({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h1 className="text-2xl font-bold text-center text-gray-900">
            ルームに参加
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            招待コードを入力してルームに参加します
          </p>
        </div>

        {actionData?.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="space-y-6">
          <div>
            <label
              htmlFor="inviteCode"
              className="block text-sm font-medium text-gray-700"
            >
              招待コード
            </label>
            <input
              id="inviteCode"
              name="inviteCode"
              type="text"
              required
              maxLength={6}
              placeholder="例: ABC234"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 uppercase"
              style={{ textTransform: "uppercase" }}
            />
            <p className="mt-1 text-xs text-gray-500">6文字の英数字</p>
          </div>

          <div>
            <label
              htmlFor="playerName"
              className="block text-sm font-medium text-gray-700"
            >
              このルームでの表示名
            </label>
            <input
              id="playerName"
              name="playerName"
              type="text"
              required
              maxLength={50}
              placeholder="例: 田中"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="flex gap-3">
            <a
              href="/rooms"
              className="flex-1 flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
            >
              キャンセル
            </a>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50"
            >
              {isSubmitting ? "参加中..." : "参加する"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
