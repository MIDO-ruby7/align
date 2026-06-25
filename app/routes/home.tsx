import { redirect } from "react-router";
import { Link } from "react-router";
import { getOptionalUser } from "~/lib/session.server";
import type { Route } from "./+types/home";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getOptionalUser(request, context);
  if (user) throw redirect("/spaces");
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
    <div className="min-h-screen bg-gradient-to-br from-[#9cf5be] to-[#ffd8eb] flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">
        {/* Logo */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow-lg mb-4">
            <span className="text-4xl font-bold text-[#880069]" style={{ fontFamily: 'Quicksand, sans-serif' }}>A</span>
          </div>
          <h1 className="text-5xl font-bold text-[#880069] mb-2" style={{ fontFamily: 'Quicksand, sans-serif' }}>
            Align
          </h1>
          <p className="text-[#1a1c1b]/60 font-medium" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Let's get things in order! ✨
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <Link
            to="/register"
            className="block w-full bg-[#880069] text-white font-bold text-lg py-4 px-8 rounded-full border-4 border-[#1a1c1b] neo-shadow-lg text-center neo-shadow-lg-active transition-all"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            新規登録
          </Link>
          <Link
            to="/login"
            className="block w-full bg-white text-[#1a1c1b] font-bold text-lg py-4 px-8 rounded-full border-4 border-[#1a1c1b] neo-shadow text-center neo-shadow-active transition-all"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            ログイン
          </Link>
        </div>

        {/* Info */}
        <div className="mt-8 flex justify-center gap-4 text-sm text-[#1a1c1b]/50 font-medium" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          <span>最大8人</span>
          <span>·</span>
          <span>30〜40分</span>
          <span>·</span>
          <span>チームビルディング</span>
        </div>
      </div>
    </div>
  );
}
