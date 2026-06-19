import { data, redirect } from "react-router";
import { Form } from "react-router";
import type { Route } from "./+types/spaces.$spaceId.admin.settings";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { and, eq } from "drizzle-orm";

export function meta() {
  return [{ title: "デッキ設定 - Align" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const spaceId = params.spaceId;

  const db = drizzle(context.cloudflare.env.DB, { schema });

  // 管理者権限チェック（AC-4）
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) => and(eq(m.spaceId, spaceId), eq(m.userId, user.id)),
  });

  if (!membership || membership.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }

  const space = await db.query.spaces.findFirst({
    where: (s, { eq }) => eq(s.id, spaceId),
  });

  if (!space) {
    throw new Response("Not Found", { status: 404 });
  }

  return data({ user, space });
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const spaceId = params.spaceId;

  const db = drizzle(context.cloudflare.env.DB, { schema });

  // 管理者権限チェック（AC-4）
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) => and(eq(m.spaceId, spaceId), eq(m.userId, user.id)),
  });

  if (!membership || membership.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-deck-size") {
    const deckSizeRaw = formData.get("defaultDeckSize");
    const deckSize = parseInt(typeof deckSizeRaw === "string" ? deckSizeRaw : "", 10);

    if (isNaN(deckSize) || deckSize < 1 || deckSize > 100) {
      return data(
        { error: "デッキ枚数は1〜100の整数で入力してください" },
        { status: 400 },
      );
    }

    await db
      .update(schema.spaces)
      .set({ defaultDeckSize: deckSize })
      .where(and(eq(schema.spaces.id, spaceId)));

    return redirect(`/spaces/${spaceId}/admin/settings`);
  }

  return data({ error: "不正なリクエストです" }, { status: 400 });
}

export default function AdminSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { space } = loaderData;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* ブレッドクラム */}
        <div className="mb-6 flex gap-2 text-sm text-indigo-600">
          <a href={`/spaces/${space.id}`} className="hover:underline">
            {space.name}
          </a>
          <span className="text-gray-400">/</span>
          <a href={`/spaces/${space.id}/admin/cards`} className="hover:underline">
            カード管理
          </a>
          <span className="text-gray-400">/</span>
          <span className="text-gray-700">デッキ設定</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">デッキ設定</h1>

        {actionData?.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {actionData.error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            デフォルトデッキ枚数
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            ゲーム開始時にデッキに含まれるカードの枚数を設定します。
            この値は新しいルームを作成する際のデフォルト値として使用されます。
          </p>

          <Form method="post" className="flex items-end gap-4">
            <input type="hidden" name="intent" value="update-deck-size" />
            <div>
              <label
                htmlFor="defaultDeckSize"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                デッキ枚数
              </label>
              <input
                id="defaultDeckSize"
                type="number"
                name="defaultDeckSize"
                defaultValue={space.defaultDeckSize}
                min={1}
                max={100}
                className="w-32 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
            >
              保存
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
