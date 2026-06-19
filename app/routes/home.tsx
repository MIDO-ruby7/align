import { redirect } from "react-router";
import { getOptionalUser } from "~/lib/session.server";
import { Users, Shuffle, Heart, LayoutDashboard } from "lucide-react";
import type { Route } from "./+types/home";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getOptionalUser(request, context);
  if (user) {
    throw redirect("/spaces");
  }
  return {};
}

export function meta() {
  return [
    { title: "Align — 価値観カードゲーム" },
    { name: "description", content: "チームで価値観を共有するカードゲーム" },
  ];
}

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
      <div className="max-w-md w-full text-center px-6">
        <div className="flex items-center justify-center gap-2 mb-4">
          <LayoutDashboard size={36} className="text-indigo-600" />
          <h1 className="text-5xl font-bold text-indigo-700">Align</h1>
        </div>
        <p className="text-gray-600 text-lg mb-2">価値観カードゲーム</p>
        <p className="text-gray-500 text-sm mb-10">
          チームで価値観カードを選び、互いの大切にしているものを共有しましょう。
        </p>
        <div className="flex flex-col gap-3">
          <a
            href="/register"
            className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-sm"
          >
            新規登録
          </a>
          <a
            href="/login"
            className="block w-full border border-indigo-600 text-indigo-600 hover:bg-indigo-50 font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            ログイン
          </a>
        </div>

        <div className="mt-12 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <Users size={20} className="text-indigo-600" />
            </div>
            <p className="text-xs text-gray-500">チームで集まる</p>
          </div>
          <div>
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <Shuffle size={20} className="text-indigo-600" />
            </div>
            <p className="text-xs text-gray-500">カードを選ぶ</p>
          </div>
          <div>
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <Heart size={20} className="text-indigo-600" />
            </div>
            <p className="text-xs text-gray-500">価値観を共有</p>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-8">
          最大8人 · 30〜40分 · チームビルディング
        </p>
      </div>
    </div>
  );
}
