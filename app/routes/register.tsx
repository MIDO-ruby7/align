import { redirect, data } from "react-router";
import { Form, useNavigation } from "react-router";
import { useState } from "react";
import {
  LayoutDashboard,
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        {/* ロゴ */}
        <div className="flex items-center justify-center gap-2 mb-1">
          <LayoutDashboard size={28} className="text-indigo-600" />
          <span className="text-2xl font-bold text-indigo-700">Align</span>
        </div>
        <h2 className="text-center text-lg text-gray-600 mb-6">新規登録</h2>

        {/* エラーバナー */}
        {actionData?.error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span className="text-sm">{actionData.error}</span>
          </div>
        )}

        <Form method="post" className="space-y-5">
          {/* 名前 */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              名前
            </label>
            <div className="relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                placeholder="山田 太郎"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* メールアドレス */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              メールアドレス
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* パスワード */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              パスワード（8文字以上）
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                className="w-full pl-9 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader size={16} className="animate-spin" />
                登録中...
              </>
            ) : (
              "登録する"
            )}
          </button>
        </Form>

        <p className="text-center text-sm text-gray-600 mt-6">
          すでにアカウントをお持ちの方は{" "}
          <a href="/login" className="text-indigo-600 hover:underline">
            ログイン
          </a>
        </p>
      </div>
    </div>
  );
}
