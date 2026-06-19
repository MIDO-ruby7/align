import { redirect, data } from "react-router";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/rooms.new";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";

export function meta() {
  return [{ title: "ルーム作成 - Align" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const db = drizzle(context.cloudflare.env.DB, { schema });

  // ユーザーが所属するスペース一覧
  const memberships = await db.query.spaceMembers.findMany({
    where: (m, { eq }) => eq(m.userId, user.id),
    with: {
      space: true,
    },
  });

  return {
    user,
    spaces: memberships.map((m) => m.space),
  };
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // Lを除外
  const array = new Uint32Array(6);
  crypto.getRandomValues(array);
  return Array.from(array, (n) => chars[n % chars.length]).join("");
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const spaceId = formData.get("spaceId");
  const playerName = formData.get("playerName");

  if (typeof spaceId !== "string" || !spaceId.trim()) {
    return data({ error: "スペースを選択してください" }, { status: 400 });
  }

  if (typeof playerName !== "string" || !playerName.trim()) {
    return data({ error: "プレイヤー名を入力してください" }, { status: 400 });
  }

  if (playerName.trim().length > 50) {
    return data({ error: "プレイヤー名は50文字以内で入力してください" }, { status: 400 });
  }

  const db = drizzle(context.cloudflare.env.DB, { schema });

  // スペースメンバーチェック
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) => and(eq(m.spaceId, spaceId), eq(m.userId, user.id)),
  });

  if (!membership) {
    return data({ error: "このスペースのメンバーではありません" }, { status: 403 });
  }

  // スペースの defaultDeckSize を取得
  const space = await db.query.spaces.findFirst({
    where: (s, { eq }) => eq(s.id, spaceId),
  });
  if (!space) throw new Response("Space not found", { status: 404 });

  const deckSize = space.defaultDeckSize ?? 20;

  // 招待コードを生成（重複時はリトライ）
  let inviteCode = "";
  let attempts = 0;
  while (attempts < 5) {
    const candidate = generateInviteCode();
    const existing = await db.query.rooms.findFirst({
      where: (r, { eq }) => eq(r.inviteCode, candidate),
    });
    if (!existing) {
      inviteCode = candidate;
      break;
    }
    attempts++;
  }

  if (!inviteCode) {
    return data({ error: "招待コードの生成に失敗しました。再度お試しください" }, { status: 500 });
  }

  const roomId = crypto.randomUUID();
  const now = new Date();

  await db.insert(schema.rooms).values({
    id: roomId,
    spaceId,
    inviteCode,
    hostUserId: user.id,
    status: "waiting",
    deckSize,
    createdAt: now,
  });

  // ホストをルームプレイヤーとして追加
  await db.insert(schema.roomPlayers).values({
    id: crypto.randomUUID(),
    roomId,
    userId: user.id,
    name: playerName.trim(),
    seatOrder: 1,
    joinedAt: now,
  });

  throw redirect(`/rooms/${roomId}`);
}

export default function RoomsNew({ loaderData, actionData }: Route.ComponentProps) {
  const { spaces } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h1 className="text-2xl font-bold text-center text-gray-900">
            ルームを作成
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            スペースを選択して新しいゲームルームを作成します
          </p>
        </div>

        {actionData?.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {actionData.error}
          </div>
        )}

        {spaces.length === 0 ? (
          <div className="text-center">
            <p className="text-gray-500 mb-4">
              ルームを作成するにはスペースへの参加が必要です
            </p>
            <a
              href="/spaces"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
            >
              スペース一覧へ
            </a>
          </div>
        ) : (
          <Form method="post" className="space-y-6">
            <div>
              <label
                htmlFor="spaceId"
                className="block text-sm font-medium text-gray-700"
              >
                スペース
              </label>
              <select
                id="spaceId"
                name="spaceId"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">スペースを選択してください</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
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
                {isSubmitting ? "作成中..." : "作成する"}
              </button>
            </div>
          </Form>
        )}
      </div>
    </div>
  );
}
