import { Link } from "react-router";
import type { Route } from "./+types/spaces._index";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";

export function meta() {
  return [{ title: "スペース一覧 - Align" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const db = drizzle(context.cloudflare.env.DB, { schema });

  const memberships = await db.query.spaceMembers.findMany({
    where: (m, { eq }) => eq(m.userId, user.id),
    with: {
      space: true,
    },
  });

  return {
    user,
    spaces: memberships.map((m) => ({
      ...m.space,
      role: m.role,
    })),
  };
}

export default function SpacesIndex({ loaderData }: Route.ComponentProps) {
  const { user, spaces } = loaderData;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">スペース一覧</h1>
            <p className="text-sm text-gray-600 mt-1">{user.name} さんのスペース</p>
          </div>
          <Link
            to="/spaces/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
          >
            新しいスペースを作成
          </Link>
        </div>

        {spaces.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">まだスペースに参加していません</p>
            <Link
              to="/spaces/new"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
            >
              最初のスペースを作成する
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((space) => (
              <Link
                key={space.id}
                to={`/spaces/${space.id}`}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow block"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  {space.name}
                </h2>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    space.role === "admin"
                      ? "bg-purple-100 text-purple-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {space.role === "admin" ? "管理者" : "メンバー"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
