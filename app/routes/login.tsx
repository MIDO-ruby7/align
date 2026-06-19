import { redirect, data } from "react-router";
import { Form, useNavigation, Link } from "react-router";
import { useState } from "react";
import {
  LayoutDashboard,
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        {/* ロゴ */}
        <div className="flex items-center justify-center gap-2 mb-1">
          <LayoutDashboard size={28} className="text-indigo-600" />
          <span className="text-2xl font-bold text-indigo-700">Align</span>
        </div>
        <h2 className="text-center text-lg text-gray-600 mb-6">ログイン</h2>

        {/* エラーバナー */}
        {actionData?.error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span className="text-sm">{actionData.error}</span>
          </div>
        )}

        <Form method="post" className="space-y-5">
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
              パスワード
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
                autoComplete="current-password"
                required
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
                ログイン中...
              </>
            ) : (
              "ログイン"
            )}
          </button>
        </Form>

        <p className="text-center text-sm text-gray-600 mt-6">
          アカウントをお持ちでない方は{" "}
          <Link to="/register" className="text-indigo-600 hover:underline">
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}
