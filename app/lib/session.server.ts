import { redirect } from "react-router";
import type { AppLoadContext } from "react-router";
import { createAuth } from "./auth.server";

export type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * 認証済みユーザーを返す。未認証の場合は /login にリダイレクト。
 */
export async function requireUser(
  request: Request,
  context: AppLoadContext,
): Promise<User> {
  const auth = createAuth(context.cloudflare.env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw redirect("/login");
  }
  return session.user as User;
}

/**
 * 現在のセッションユーザーを返す。未認証の場合は null。
 */
export async function getOptionalUser(
  request: Request,
  context: AppLoadContext,
): Promise<User | null> {
  const auth = createAuth(context.cloudflare.env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return session.user as User;
}
