import { Link } from "react-router";
import type { Route } from "./+types/rooms._index";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";

export function meta() {
  return [{ title: "ルーム - Align" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const db = drizzle(context.cloudflare.env.DB, { schema });

  // ユーザーが参加しているルームを取得
  const playerRecords = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.userId, user.id),
    with: {
      room: {
        with: {
          space: true,
        },
      },
    },
  });

  const rooms = playerRecords.map((rp) => rp.room);

  return { user, rooms };
}

export default function RoomsIndex({ loaderData }: Route.ComponentProps) {
  const { user, rooms } = loaderData;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ルーム</h1>
            <p className="text-sm text-gray-600 mt-1">{user.name} さんのルーム</p>
          </div>
          <div className="flex gap-3">
            <Link
              to="/rooms/join"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
            >
              招待コードで参加
            </Link>
            <Link
              to="/rooms/new"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
            >
              ルームを作成
            </Link>
          </div>
        </div>

        {rooms.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">参加中のルームはありません</p>
            <div className="flex gap-3 justify-center">
              <Link
                to="/rooms/join"
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                招待コードで参加
              </Link>
              <Link
                to="/rooms/new"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
              >
                ルームを作成する
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <Link
                key={room.id}
                to={`/rooms/${room.id}`}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow block"
              >
                <div className="flex justify-between items-start mb-2">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {room.space?.name ?? "スペース"}
                  </h2>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      room.status === "waiting"
                        ? "bg-yellow-100 text-yellow-800"
                        : room.status === "playing"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {room.status === "waiting"
                      ? "待機中"
                      : room.status === "playing"
                        ? "プレイ中"
                        : "終了"}
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  招待コード: {room.inviteCode}
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-6">
          <Link to="/spaces" className="text-sm text-indigo-600 hover:underline">
            &larr; スペース一覧に戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
