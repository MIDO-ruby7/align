import { data } from "react-router";
import { Form, Link } from "react-router";
import type { Route } from "./+types/spaces.$spaceId.members";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { and, eq } from "drizzle-orm";

export function meta() {
  return [{ title: "メンバー一覧 - Align" }];
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

  const members = await db.query.spaceMembers.findMany({
    where: (m, { eq }) => eq(m.spaceId, spaceId),
    with: {
      user: true,
    },
  });

  return {
    user,
    space,
    members: members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      name: m.user.name,
      email: m.user.email,
    })),
    currentUserRole: membership.role,
  };
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
  const intent = formData.get("intent");
  const targetUserId = formData.get("userId");

  if (intent === "remove" && typeof targetUserId === "string") {
    // 自分自身は削除不可
    if (targetUserId === user.id) {
      return data({ error: "自分自身をスペースから削除することはできません" }, { status: 400 });
    }

    await db
      .delete(schema.spaceMembers)
      .where(
        and(
          eq(schema.spaceMembers.spaceId, spaceId),
          eq(schema.spaceMembers.userId, targetUserId),
        ),
      );
  }

  return null;
}

export default function SpaceMembers({ loaderData, actionData }: Route.ComponentProps) {
  const { user, space, members, currentUserRole } = loaderData;
  const isAdmin = currentUserRole === "admin";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="mb-6">
          <a
            href={`/spaces/${space.id}`}
            className="text-sm text-indigo-600 hover:underline"
          >
            &larr; {space.name} に戻る
          </a>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            メンバー一覧
          </h1>
          {isAdmin && (
            <Link
              to={`/spaces/${space.id}/invite`}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
            >
              メンバーを招待
            </Link>
          )}
        </div>

        {actionData?.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {actionData.error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  名前
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  メールアドレス
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ロール
                </th>
                {isAdmin && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {members.map((member) => (
                <tr key={member.userId}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {member.name}
                      {member.userId === user.id && (
                        <span className="ml-2 text-xs text-gray-500">（あなた）</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{member.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        member.role === "admin"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {member.role === "admin" ? "管理者" : "メンバー"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {member.userId !== user.id && (
                        <Form method="post" className="inline">
                          <input type="hidden" name="intent" value="remove" />
                          <input type="hidden" name="userId" value={member.userId} />
                          <button
                            type="submit"
                            className="text-sm text-red-600 hover:text-red-900 font-medium"
                            onClick={(e) => {
                              if (!confirm(`${member.name} をスペースから削除しますか？`)) {
                                e.preventDefault();
                              }
                            }}
                          >
                            削除
                          </button>
                        </Form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
