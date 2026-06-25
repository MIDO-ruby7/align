import { redirect, data } from "react-router";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/spaces.new";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";

export function meta() {
  return [{ title: "スペース作成 - Align" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  return { user };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);

  const formData = await request.formData();
  const name = formData.get("name");

  if (typeof name !== "string" || !name.trim()) {
    return data({ error: "スペース名を入力してください" }, { status: 400 });
  }

  if (name.trim().length > 100) {
    return data({ error: "スペース名は100文字以内で入力してください" }, { status: 400 });
  }

  const db = drizzle(context.cloudflare.env.DB, { schema });
  const spaceId = crypto.randomUUID();
  const now = new Date();

  // master_cards を先に取得（クエリのみ、まだ書き込まない）
  const { eq } = await import("drizzle-orm");
  const masters = await db
    .select()
    .from(schema.masterCards)
    .where(eq(schema.masterCards.isActive, true));

  const nowStr = now.toISOString();

  // D1 は BEGIN/COMMIT トランザクション非対応のため batch() でアトミックに実行する。
  // batch() 内のすべてのステートメントが成功するか、全て失敗するかのいずれかになる。
  await db.batch([
    db.insert(schema.spaces).values({
      id: spaceId,
      name: name.trim(),
      ownerUserId: user.id,
      createdAt: now,
    }),
    db.insert(schema.spaceMembers).values({
      spaceId,
      userId: user.id,
      role: "admin",
      joinedAt: now,
    }),
    // カードを 1 行ずつ batch に追加（D1 の 100 パラメータ制限を回避）
    ...masters.map((m) =>
      db.insert(schema.cards).values({
        id: crypto.randomUUID(),
        spaceId,
        text: m.text,
        isActive: true,
        createdAt: new Date(nowStr),
        updatedAt: new Date(nowStr),
      })
    ),
  ]);

  throw redirect(`/spaces/${spaceId}`);
}

export default function SpacesNew({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-[#f9f9f7]">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* 戻るリンク */}
        <a
          href="/spaces"
          className="text-[#880069] text-sm flex items-center gap-1 mb-6 hover:underline font-medium"
        >
          &larr; スペース一覧に戻る
        </a>

        <h1
          className="text-2xl font-black text-[#1a1c1b] mb-6"
          style={{ fontFamily: "Quicksand" }}
        >
          新しいスペースを作成
        </h1>

        {actionData?.error && (
          <div className="bg-red-50 border-2 border-red-400 text-red-700 px-4 py-3 rounded-xl mb-4">
            {actionData.error}
          </div>
        )}

        <div className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow-lg p-6">
          <Form method="post" className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-bold text-[#1a1c1b] mb-1"
                style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
              >
                スペース名
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                maxLength={100}
                placeholder="例: 開発チーム"
                className="block w-full border-2 border-[#1a1c1b] rounded-full px-4 py-3 focus:outline-none focus:border-[#880069] font-medium"
                style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <a
                href="/spaces"
                className="flex-1 flex justify-center py-4 px-4 bg-white text-[#1a1c1b] border-4 border-[#1a1c1b] rounded-full font-bold neo-shadow hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#1a1c1b] transition-all text-sm"
                style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
              >
                キャンセル
              </a>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 flex justify-center py-4 px-4 bg-[#880069] text-white border-4 border-[#1a1c1b] rounded-full font-bold neo-shadow-lg neo-shadow-lg-active transition-all disabled:opacity-50 text-sm"
                style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
              >
                {isSubmitting ? "作成中..." : "作成する"}
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
