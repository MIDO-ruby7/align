import { redirect, data } from "react-router";
import { Form, useNavigation, Link } from "react-router";
import { useState } from "react";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader,
  AlertCircle,
} from "lucide-react";
import type { Route } from "./+types/register";
import { createAuth } from "~/lib/auth.server";

export function meta() {
  return [{ title: "新規登録 - Align" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const auth = createAuth(context.cloudflare.env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) {
    throw redirect("/");
  }
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return data({ error: "入力値が不正です" }, { status: 400 });
  }

  if (!name.trim() || !email.trim() || !password) {
    return data({ error: "すべての項目を入力してください" }, { status: 400 });
  }

  if (password.length < 8) {
    return data(
      { error: "パスワードは8文字以上で設定してください" },
      { status: 400 },
    );
  }

  const auth = createAuth(context.cloudflare.env);

  try {
    // GAP-3: signUpEmail を asResponse: true で一度だけ呼び、
    // そのレスポンスの Set-Cookie をそのままコピーしてリダイレクトする。
    // signInEmail を二重に呼ぶゾンビセッションを防ぐ。
    const response = await auth.api.signUpEmail({
      body: {
        name: name.trim(),
        email: email.trim(),
        password,
      },
      asResponse: true,
    });

    if (!response.ok) {
      // V-2: アカウント列挙を防ぐため、既登録かどうかに関わらず統一メッセージを返す。
      return data(
        { error: "登録できませんでした。入力内容をご確認ください" },
        { status: 400 },
      );
    }

    // Set-Cookie ヘッダーをコピーしてリダイレクト
    const headers = new Headers(response.headers);
    headers.set("Location", "/spaces");
    return new Response(null, { status: 302, headers });
  } catch {
    // パスワードは絶対にログに出さない
    // V-2: エラー種別を外部に漏らさない統一メッセージ
    return data(
      { error: "登録できませんでした。入力内容をご確認ください" },
      { status: 400 },
    );
  }
}

export default function Register({ actionData }: Route.ComponentProps) {
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
              className="flex-1 text-center py-2 text-sm font-bold text-[#1a1c1b]/70"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              ログイン
            </Link>
            <Link
              to="/register"
              className="flex-1 text-center py-2 text-sm font-bold bg-[#ff71ce] border-2 border-[#1a1c1b] rounded-full text-[#1a1c1b]"
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
            {/* 名前 */}
            <div>
              <label
                htmlFor="name"
                className="block text-xs font-bold text-[#1a1c1b]/60 mb-1 uppercase tracking-wide"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Your Name
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1a1c1b]/40 pointer-events-none"
                />
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  placeholder="山田 太郎"
                  className="w-full pl-10 pr-4 py-3 border-2 border-[#1a1c1b] rounded-full focus:outline-none focus:ring-2 focus:ring-[#ff71ce] focus:border-[#ff71ce] bg-[#f9f9f7] text-[#1a1c1b]"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                />
              </div>
            </div>

            {/* メールアドレス */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-bold text-[#1a1c1b]/60 mb-1 uppercase tracking-wide"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Email Address
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
                Secret Password（8文字以上）
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
                  autoComplete="new-password"
                  required
                  minLength={8}
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
              className="w-full flex items-center justify-center gap-2 py-4 px-8 bg-[#880069] text-white font-bold text-lg rounded-full border-4 border-[#1a1c1b] neo-shadow-lg neo-shadow-lg-active transition-all disabled:opacity-50"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {isSubmitting ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  登録中...
                </>
              ) : (
                "Start the Journey →"
              )}
            </button>
          </Form>
        </div>

        <p className="text-center text-sm text-[#1a1c1b]/50 mt-4 font-medium" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          すでにアカウントをお持ちの方は{" "}
          <Link to="/login" className="text-[#880069] font-bold hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}
