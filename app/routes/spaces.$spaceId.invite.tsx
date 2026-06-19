import { redirect, data } from "react-router";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/spaces.$spaceId.invite";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";

export function meta() {
  return [{ title: "メンバー招待 - Align" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const spaceId = params.spaceId;

  const db = drizzle(context.cloudflare.env.DB, { schema });

  // 管理者権限チェック
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

  return { user, space };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const spaceId = params.spaceId;

  const db = drizzle(context.cloudflare.env.DB, { schema });

  // 管理者権限チェック
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) => and(eq(m.spaceId, spaceId), eq(m.userId, user.id)),
  });

  if (!membership || membership.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }

  const formData = await request.formData();
  const email = formData.get("email");

  if (typeof email !== "string" || !email.trim()) {
    return data({ error: "メールアドレスを入力してください" }, { status: 400 });
  }

  // ユーザー検索
  const targetUser = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.email, email.trim().toLowerCase()),
  });

  if (!targetUser) {
    return data({ error: "指定されたメールアドレスのユーザーが見つかりません" }, { status: 400 });
  }

  // 既にメンバーかチェック
  const existingMembership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.spaceId, spaceId), eq(m.userId, targetUser.id)),
  });

  if (existingMembership) {
    return data({ error: "このユーザーは既にスペースのメンバーです" }, { status: 400 });
  }

  // メンバーとして追加
  await db.insert(schema.spaceMembers).values({
    spaceId,
    userId: targetUser.id,
    role: "member",
    joinedAt: new Date(),
  });

  throw redirect(`/spaces/${spaceId}/members`);
}

export default function SpaceInvite({ loaderData, actionData }: Route.ComponentProps) {
  const { space } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6">
          <a
            href={`/spaces/${space.id}`}
            className="text-sm text-indigo-600 hover:underline"
          >
            &larr; {space.name} に戻る
          </a>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            メンバーを招待
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            招待するユーザーのメールアドレスを入力してください。
            既に登録済みのユーザーのみ招待できます。
          </p>

          {actionData?.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {actionData.error}
            </div>
          )}

          <Form method="post" className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                メールアドレス
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="user@example.com"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <a
                href={`/spaces/${space.id}/members`}
                className="flex-1 flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                キャンセル
              </a>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50"
              >
                {isSubmitting ? "招待中..." : "招待する"}
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
