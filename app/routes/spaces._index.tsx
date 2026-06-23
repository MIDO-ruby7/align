import { Link } from "react-router";
import { ChevronRight, Plus } from "lucide-react";
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
    <div className="min-h-screen bg-[#f9f9f7]">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* ヘッダー */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1
              className="text-3xl font-bold text-[#1a1c1b]"
              style={{ fontFamily: "Quicksand" }}
            >
              My Spaces
            </h1>
            <p className="text-sm text-[#1a1c1b]/60 mt-1">
              {user.name} さんのコラボレーションスペース
            </p>
          </div>
          <Link
            to="/spaces/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff71ce] border-4 border-[#1a1c1b] rounded-full font-bold text-[#1a1c1b] text-sm neo-shadow hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#1a1c1b] transition-all"
          >
            <Plus size={16} />
            新しいスペースを作成
          </Link>
        </div>

        {spaces.length === 0 ? (
          <div className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow-lg p-10 text-center">
            <p className="text-[#1a1c1b]/60 mb-5 text-sm">
              まだスペースに参加していません
            </p>
            <Link
              to="/spaces/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff71ce] border-4 border-[#1a1c1b] rounded-full font-bold text-[#1a1c1b] text-sm neo-shadow hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#1a1c1b] transition-all"
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
                className="group bg-white border-4 border-[#1a1c1b] rounded-2xl p-5 neo-shadow-lg hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#1a1c1b] transition-all block"
              >
                <div className="flex items-start justify-between mb-3">
                  <h2
                    className="text-lg font-bold text-[#1a1c1b]"
                    style={{ fontFamily: "Quicksand" }}
                  >
                    {space.name}
                  </h2>
                  <ChevronRight
                    size={18}
                    className="flex-shrink-0 mt-0.5 text-[#1a1c1b]/30 group-hover:text-[#880069] transition-colors"
                  />
                </div>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border-2 border-[#1a1c1b] ${
                    space.role === "admin"
                      ? "bg-[#ff71ce] text-[#1a1c1b]"
                      : "bg-[#e7e482] text-[#1a1c1b]"
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
