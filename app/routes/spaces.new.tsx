import { redirect, data } from "react-router";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/spaces.new";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { seedSpaceCards } from "../../db/seed";

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

  await db.insert(schema.spaces).values({
    id: spaceId,
    name: name.trim(),
    ownerUserId: user.id,
    createdAt: now,
  });

  await db.insert(schema.spaceMembers).values({
    spaceId,
    userId: user.id,
    role: "admin",
    joinedAt: now,
  });

  // マスターカードをスペース用にコピー
  await seedSpaceCards(db, spaceId);

  throw redirect(`/spaces/${spaceId}`);
}

export default function SpacesNew({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h1 className="text-2xl font-bold text-center text-gray-900">
            新しいスペースを作成
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            チームや組織のスペースを作成します
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
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
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
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="flex gap-3">
            <a
              href="/spaces"
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
      </div>
    </div>
  );
}
