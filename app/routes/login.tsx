import { redirect, data } from "react-router";
import { Form, useNavigation, Link } from "react-router";
import { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader,
  AlertCircle,
} from "lucide-react";
import type { Route } from "./+types/login";
import { createAuth } from "~/lib/auth.server";

export function meta() {
  return [{ title: "ログイン - Align" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const auth = createAuth(context.cloudflare.env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) {
    throw redirect("/spaces");
  }
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return data({ error: "入力値が不正です" }, { status: 400 });
  }

  if (!email.trim() || !password) {
    return data(
      { error: "メールアドレスとパスワードを入力してください" },
      { status: 400 },
    );
  }

  const auth = createAuth(context.cloudflare.env);

  try {
    const result = await auth.api.signInEmail({
      body: { email: email.trim(), password },
      asResponse: true,
    });

    if (!result.ok) {
      return data(
        { error: "メールアドレスまたはパスワードが正しくありません" },
        { status: 401 },
      );
    }

    const setCookie = result.headers.get("set-cookie");
    const headers = new Headers();
    if (setCookie) {
      headers.set("set-cookie", setCookie);
    }
    headers.set("location", "/spaces");
    return new Response(null, { status: 302, headers });
  } catch {
    // パスワードは絶対にログに出さない
    return data(
      { error: "メールアドレスまたはパスワードが正しくありません" },
      { status: 401 },
    );
  }
}

export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#9cf5be] to-[#ffd8eb] flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow mb-3">
            <span className="text-3xl font-bold text-[#880069]" style={{ fontFamily: 'Quicksand, sans-serif' }}>A</span>
          </div>
          <h1 className="text-3xl font-bold text-[#880069]" style={{ fontFamily: 'Quicksand, sans-serif' }}>
            Align
          </h1>
          <p className="text-[#1a1c1b]/60 text-sm mt-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Let's get things in order! ✨
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow-lg p-6">
          {/* Tab switcher */}
          <div className="flex bg-[#f4f4f2] border-2 border-[#1a1c1b] rounded-full p-1 mb-6">
            <Link
              to="/login"
              className="flex-1 text-center py-2 text-sm font-bold bg-[#ff71ce] border-2 border-[#1a1c1b] rounded-full text-[#1a1c1b]"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              ログイン
            </Link>
            <Link
              to="/register"
              className="flex-1 text-center py-2 text-sm font-bold text-[#1a1c1b]/50"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              新規登録
            </Link>
          </div>

          {/* エラーバナー */}
          {actionData?.error && (
            <div className="flex items-center gap-2 bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl mb-4">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span className="text-sm" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{actionData.error}</span>
            </div>
          )}

          <Form method="post" className="space-y-4">
            {/* メールアドレス */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-bold text-[#1a1c1b]/60 mb-1 uppercase tracking-wide"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Email or Nickname
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1a1c1b]/40 pointer-events-none"
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 border-2 border-[#1a1c1b] rounded-full focus:outline-none focus:ring-2 focus:ring-[#ff71ce] focus:border-[#ff71ce] bg-[#f9f9f7] text-[#1a1c1b]"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                />
              </div>
            </div>

            {/* パスワード */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-bold text-[#1a1c1b]/60 mb-1 uppercase tracking-wide"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Secret Password
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1a1c1b]/40 pointer-events-none"
                />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-12 py-3 border-2 border-[#1a1c1b] rounded-full focus:outline-none focus:ring-2 focus:ring-[#ff71ce] focus:border-[#ff71ce] bg-[#f9f9f7] text-[#1a1c1b]"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#1a1c1b]/40 hover:text-[#1a1c1b]"
                  aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-4 px-8 bg-[#ff71ce] text-[#1a1c1b] font-bold text-lg rounded-full border-4 border-[#1a1c1b] neo-shadow neo-shadow-active transition-all disabled:opacity-50"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {isSubmitting ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  ログイン中...
                </>
              ) : (
                "Enter the Journey →"
              )}
            </button>
          </Form>
        </div>

        <p className="text-center text-sm text-[#1a1c1b]/50 mt-4 font-medium" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          アカウントをお持ちでない方は{" "}
          <Link to="/register" className="text-[#880069] font-bold hover:underline">
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}
