import { data, redirect } from "react-router";
import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/spaces.$spaceId.admin.cards";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { and, eq, like, sql } from "drizzle-orm";

const PAGE_SIZE = 20;

export function meta() {
  return [{ title: "カード管理 - Align" }];
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

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  // 検索条件（AC-1）
  const whereCondition = q
    ? and(eq(schema.cards.spaceId, spaceId), like(schema.cards.text, `%${q}%`))
    : eq(schema.cards.spaceId, spaceId);

  const [cards, totalResult] = await Promise.all([
    db
      .select()
      .from(schema.cards)
      .where(whereCondition)
      .orderBy(schema.cards.createdAt)
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.cards)
      .where(whereCondition),
  ]);

  const total = totalResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return data({ user, space, cards, q, page, totalPages, total });
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

  if (intent === "create") {
    // 新規作成（AC-2）
    const text = formData.get("text");
    if (typeof text !== "string") {
      return data({ error: "カードのテキストを入力してください" }, { status: 400 });
    }
    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      return data({ error: "カードのテキストを入力してください" }, { status: 400 });
    }
    if (trimmedText.length > 200) {
      return data({ error: "カードのテキストは200文字以内にしてください" }, { status: 400 });
    }
    const now = new Date();
    await db.insert(schema.cards).values({
      id: crypto.randomUUID(),
      spaceId,
      text: trimmedText,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    return redirect(`/spaces/${spaceId}/admin/cards`);
  }

  if (intent === "update") {
    // 編集（AC-2）
    const cardId = formData.get("cardId");
    const text = formData.get("text");
    if (typeof cardId !== "string" || typeof text !== "string") {
      return data({ error: "不正なリクエストです" }, { status: 400 });
    }
    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      return data({ error: "カードのテキストを入力してください" }, { status: 400 });
    }
    if (trimmedText.length > 200) {
      return data({ error: "カードのテキストは200文字以内にしてください" }, { status: 400 });
    }
    // クロスアクセス防止: そのカードが当スペースに属することを確認
    const card = await db.query.cards.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, cardId), eq(c.spaceId, spaceId)),
    });
    if (!card) {
      throw new Response("Not Found", { status: 404 });
    }
    await db
      .update(schema.cards)
      .set({ text: trimmedText, updatedAt: new Date() })
      .where(and(eq(schema.cards.id, cardId), eq(schema.cards.spaceId, spaceId)));
    return redirect(`/spaces/${spaceId}/admin/cards`);
  }

  if (intent === "deactivate") {
    // 論理削除（AC-2、物理削除は実装しない）
    const cardId = formData.get("cardId");
    if (typeof cardId !== "string") {
      return data({ error: "不正なリクエストです" }, { status: 400 });
    }
    const card = await db.query.cards.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, cardId), eq(c.spaceId, spaceId)),
    });
    if (!card) {
      throw new Response("Not Found", { status: 404 });
    }
    await db
      .update(schema.cards)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.cards.id, cardId), eq(schema.cards.spaceId, spaceId)));
    return redirect(`/spaces/${spaceId}/admin/cards`);
  }

  if (intent === "activate") {
    // 論理削除を元に戻す
    const cardId = formData.get("cardId");
    if (typeof cardId !== "string") {
      return data({ error: "不正なリクエストです" }, { status: 400 });
    }
    const card = await db.query.cards.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, cardId), eq(c.spaceId, spaceId)),
    });
    if (!card) {
      throw new Response("Not Found", { status: 404 });
    }
    await db
      .update(schema.cards)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(schema.cards.id, cardId), eq(schema.cards.spaceId, spaceId)));
    return redirect(`/spaces/${spaceId}/admin/cards`);
  }

  return data({ error: "不正なリクエストです" }, { status: 400 });
}

export default function AdminCards({ loaderData, actionData }: Route.ComponentProps) {
  const { space, cards, q, page, totalPages, total } = loaderData;
  const [searchParams] = useSearchParams();

  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto py-8 px-4">
        {/* ブレッドクラム */}
        <div className="mb-6 flex gap-2 text-sm text-indigo-600">
          <a href={`/spaces/${space.id}`} className="hover:underline">
            {space.name}
          </a>
          <span className="text-gray-400">/</span>
          <span className="text-gray-700">カード管理</span>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">カード管理</h1>
          <Link
            to={`/spaces/${space.id}/admin/settings`}
            className="text-sm text-indigo-600 hover:underline"
          >
            デッキ設定へ
          </Link>
        </div>

        {actionData?.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {actionData.error}
          </div>
        )}

        {/* 新規作成フォーム */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">新規カード追加</h2>
          <Form method="post" className="flex gap-3">
            <input type="hidden" name="intent" value="create" />
            <input
              type="text"
              name="text"
              placeholder="カードテキストを入力"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              maxLength={200}
              required
            />
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
            >
              追加
            </button>
          </Form>
        </div>

        {/* 検索フォーム */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <Form method="get" className="flex gap-3">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="カードテキストで検索"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700"
            >
              検索
            </button>
            {q && (
              <a
                href="?"
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
              >
                クリア
              </a>
            )}
          </Form>
          <p className="text-xs text-gray-500 mt-2">全 {total} 件</p>
        </div>

        {/* カード一覧 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  カードテキスト
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状態
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  作成日
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cards.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                    カードがありません
                  </td>
                </tr>
              )}
              {cards.map((card) => (
                <CardRow key={card.id} card={card} />
              ))}
            </tbody>
          </table>
        </div>

        {/* ページネーション */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            {page > 1 && (
              <a
                href={buildPageUrl(page - 1)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
              >
                前へ
              </a>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={buildPageUrl(p)}
                className={`px-3 py-2 border rounded-md text-sm ${
                  p === page
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {p}
              </a>
            ))}
            {page < totalPages && (
              <a
                href={buildPageUrl(page + 1)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
              >
                次へ
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type Card = {
  id: string;
  text: string;
  isActive: boolean;
  createdAt: Date;
};

function CardRow({ card }: { card: Card }) {
  return (
    <tr className={card.isActive ? "" : "bg-gray-50 opacity-60"}>
      <td className="px-6 py-4">
        <EditableText card={card} />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            card.isActive
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {card.isActive ? "有効" : "無効"}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {new Date(card.createdAt).toLocaleDateString("ja-JP")}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right">
        <Form method="post" className="inline">
          <input type="hidden" name="intent" value={card.isActive ? "deactivate" : "activate"} />
          <input type="hidden" name="cardId" value={card.id} />
          <button
            type="submit"
            className={`text-sm font-medium ${
              card.isActive
                ? "text-red-600 hover:text-red-900"
                : "text-green-600 hover:text-green-900"
            }`}
          >
            {card.isActive ? "無効化" : "有効化"}
          </button>
        </Form>
      </td>
    </tr>
  );
}

function EditableText({ card }: { card: Card }) {
  return (
    <Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="cardId" value={card.id} />
      <input
        type="text"
        name="text"
        defaultValue={card.text}
        className="flex-1 text-sm text-gray-900 border border-transparent rounded px-2 py-1 hover:border-gray-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        maxLength={200}
      />
      <button
        type="submit"
        className="text-xs text-indigo-600 hover:text-indigo-900 font-medium whitespace-nowrap"
      >
        保存
      </button>
    </Form>
  );
}
