import { redirect, data } from "react-router";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/rooms.new";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";

export function meta() {
  return [{ title: "ゲームを作成 - Align" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const db = drizzle(context.cloudflare.env.DB, { schema });

  const url = new URL(request.url);
  const preselectedSpaceId = url.searchParams.get("spaceId");

  // ユーザーが所属するスペース一覧
  const memberships = await db.query.spaceMembers.findMany({
    where: (m, { eq }) => eq(m.userId, user.id),
    with: {
      space: true,
    },
  });

  const spaces = memberships.map((m) => m.space);

  // preselectedSpaceId が指定されている場合、メンバーであるか確認
  const validPreselectedSpaceId =
    preselectedSpaceId && spaces.some((s) => s.id === preselectedSpaceId)
      ? preselectedSpaceId
      : null;

  return {
    user,
    spaces,
    preselectedSpaceId: validPreselectedSpaceId,
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
  const { user, spaces, preselectedSpaceId } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // スペースが1つのみ or クエリパラメータで指定済みの場合は自動選択
  const autoSelectedSpaceId =
    preselectedSpaceId ?? (spaces.length === 1 ? spaces[0]?.id : null);
  const autoSelectedSpace = autoSelectedSpaceId
    ? spaces.find((s) => s.id === autoSelectedSpaceId)
    : null;

  return (
    <div className="min-h-screen bg-[#f9f9f7]">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* 戻るリンク */}
        {autoSelectedSpace ? (
          <a
            href={`/spaces/${autoSelectedSpace.id}`}
            className="text-[#880069] text-sm flex items-center gap-1 mb-6 hover:underline font-medium"
          >
            &larr; {autoSelectedSpace.name} に戻る
          </a>
        ) : (
          <a
            href="/spaces"
            className="text-[#880069] text-sm flex items-center gap-1 mb-6 hover:underline font-medium"
          >
            &larr; スペース一覧に戻る
          </a>
        )}

        <h1
          className="text-2xl font-bold text-[#1a1c1b] mb-1"
          style={{ fontFamily: "Quicksand" }}
        >
          新しいゲームを作成
        </h1>
        {autoSelectedSpace && (
          <p className="text-[#1a1c1b]/50 text-sm mb-6">
            {autoSelectedSpace.name} のメンバーを招待できます
          </p>
        )}

        {actionData?.error && (
          <div className="bg-red-50 border-2 border-red-400 text-red-700 px-4 py-3 rounded-xl mb-4">
            {actionData.error}
          </div>
        )}

        {spaces.length === 0 ? (
          <div className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow-lg p-6 text-center">
            <p className="text-[#1a1c1b]/60 mb-4">
              ルームを作成するにはスペースへの参加が必要です
            </p>
            <a
              href="/spaces"
              className="inline-flex items-center px-5 py-2.5 bg-[#880069] border-4 border-[#1a1c1b] rounded-full font-bold text-white text-sm neo-shadow-lg neo-shadow-lg-active transition-all"
            >
              スペース一覧へ
            </a>
          </div>
        ) : (
          <>
            <div className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow-lg p-6">
              <Form method="post" className="space-y-4">
                {/* スペース選択 */}
                {autoSelectedSpace ? (
                  <input type="hidden" name="spaceId" value={autoSelectedSpace.id} />
                ) : (
                  <div>
                    <label
                      htmlFor="spaceId"
                      className="block text-sm font-bold text-[#1a1c1b] mb-1"
                    >
                      スペース
                    </label>
                    <select
                      id="spaceId"
                      name="spaceId"
                      required
                      className="block w-full px-4 py-3 border-2 border-[#1a1c1b] rounded-full focus:outline-none focus:border-[#880069] font-medium"
                    >
                      <option value="">スペースを選択してください</option>
                      {spaces.map((space) => (
                        <option key={space.id} value={space.id}>
                          {space.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 表示名 */}
                <div>
                  <label
                    htmlFor="playerName"
                    className="block text-sm font-bold text-[#1a1c1b] mb-1"
                  >
                    あなたの表示名
                  </label>
                  <input
                    id="playerName"
                    name="playerName"
                    type="text"
                    required
                    maxLength={50}
                    defaultValue={user.name}
                    className="block w-full px-4 py-3 border-2 border-[#1a1c1b] rounded-full focus:outline-none focus:border-[#880069] font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center py-3.5 px-4 bg-[#880069] border-4 border-[#1a1c1b] rounded-full font-bold text-white neo-shadow-lg neo-shadow-lg-active transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "作成中..." : "ゲームを作成して招待コードを取得"}
                </button>
              </Form>
            </div>

            <div className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow p-5 mt-4">
              <h3
                className="text-sm font-bold text-[#1a1c1b] mb-3"
                style={{ fontFamily: "Quicksand" }}
              >
                ゲームの流れ
              </h3>
              <ol className="space-y-3">
                {[
                  { step: "1", text: "招待コードをチームメンバーに共有" },
                  { step: "2", text: "全員が参加したらゲーム開始" },
                  { step: "3", text: "順番に価値観カードを引いて5枚を選ぶ" },
                  { step: "4", text: "互いの選択を見ながら話し合う" },
                ].map(({ step, text }) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#880069] text-white text-xs flex items-center justify-center font-bold">
                      {step}
                    </span>
                    <span className="text-sm text-[#1a1c1b]/70 mt-0.5">{text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
