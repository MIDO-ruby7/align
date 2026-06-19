import { redirect, data } from "react-router";
import { Form, useNavigation } from "react-router";
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
    const result = await auth.api.signUpEmail({
      body: {
        name: name.trim(),
        email: email.trim(),
        password,
      },
    });

    if (!result) {
      return data({ error: "登録に失敗しました" }, { status: 500 });
    }

    // 登録成功後にセッションクッキーを取得してリダイレクト
    const loginResult = await auth.api.signInEmail({
      body: { email: email.trim(), password },
      asResponse: true,
    });

    const setCookie = loginResult.headers.get("set-cookie");
    const headers = new Headers();
    if (setCookie) {
      headers.set("set-cookie", setCookie);
    }
    headers.set("location", "/");
    return new Response(null, { status: 302, headers });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "登録に失敗しました";
    // パスワードは絶対にログに出さない
    const safeMessage = message.includes("already")
      ? "このメールアドレスは既に登録されています"
      : "登録に失敗しました。もう一度お試しください";
    return data({ error: safeMessage }, { status: 400 });
  }
}

export default function Register({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h1 className="text-3xl font-bold text-center text-gray-900">
            Align
          </h1>
          <h2 className="mt-2 text-center text-xl text-gray-600">新規登録</h2>
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
              名前
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              メールアドレス
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              パスワード（8文字以上）
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50"
          >
            {isSubmitting ? "登録中..." : "登録する"}
          </button>
        </Form>

        <p className="text-center text-sm text-gray-600">
          すでにアカウントをお持ちの方は{" "}
          <a href="/login" className="text-indigo-600 hover:underline">
            ログイン
          </a>
        </p>
      </div>
    </div>
  );
}
