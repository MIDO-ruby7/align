import { redirect } from "react-router";
import { Form, useNavigation } from "react-router";
import { Play, Mail, Users, LayoutList, ArrowRight, Link } from "lucide-react";
import { useState } from "react";
import type { Route } from "./+types/spaces.$spaceId._index";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import { broadcastRoomEvent } from "~/lib/broadcast.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.space?.name ?? "スペース"} - Align` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const spaceId = params.spaceId;

  const db = drizzle(context.cloudflare.env.DB, { schema });

  // スペースへの所属確認（他スペースへのアクセス防止）
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) => and(eq(m.spaceId, spaceId), eq(m.userId, user.id)),
  });

  if (!membership) {
    throw new Response("Not Found", { status: 404 });
  }

  const space = await db.query.spaces.findFirst({
    where: (s, { eq }) => eq(s.id, spaceId),
  });

  if (!space) {
    throw new Response("Not Found", { status: 404 });
  }

  // スペースにinviteTokenがなければ生成
  let spaceWithToken = space;
  if (!space.inviteToken) {
    const token = crypto.randomUUID();
    await db.update(schema.spaces).set({ inviteToken: token }).where(eq(schema.spaces.id, spaceId));
    spaceWithToken = { ...space, inviteToken: token };
  }

  // スペース内のアクティブルームを取得（waiting または playing）
  const activeRooms = await db.query.rooms.findMany({
    where: (r, { and, eq, or }) =>
      and(
        eq(r.spaceId, spaceId),
        or(eq(r.status, "waiting"), eq(r.status, "playing")),
      ),
    with: {
      players: true,
    },
    limit: 5,
  });

  return { user, space: spaceWithToken, role: membership.role, activeRooms };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const spaceId = params.spaceId;

  if (intent === "delete") {
    const db = drizzle(context.cloudflare.env.DB, { schema });

    // ホストチェック
    const membership = await db.query.spaceMembers.findFirst({
      where: (m, { and, eq }) => and(eq(m.spaceId, spaceId), eq(m.userId, user.id)),
    });

    if (!membership || membership.role !== "admin") {
      return { error: "管理者のみ削除できます" };
    }

    // 進行中ルームチェック
    const activeRooms = await db.query.rooms.findMany({
      where: (r, { and, eq, or }) =>
        and(eq(r.spaceId, spaceId), or(eq(r.status, "waiting"), eq(r.status, "playing"))),
    });
    if (activeRooms.length > 0) {
      return { error: "進行中のゲームがあるため削除できません" };
    }

    // 関連データ削除（cards → space_members → spaces の順）
    await db.delete(schema.cards).where(eq(schema.cards.spaceId, spaceId));
    await db.delete(schema.spaceMembers).where(eq(schema.spaceMembers.spaceId, spaceId));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));

    throw redirect("/spaces");
  }

  if (intent === "join") {
    const inviteCode = formData.get("inviteCode");
    if (typeof inviteCode !== "string" || !inviteCode.trim()) {
      return { error: "招待コードを入力してください" };
    }

    const db = drizzle(context.cloudflare.env.DB, { schema });

    // 招待コードでルームを検索
    const room = await db.query.rooms.findFirst({
      where: (r, { eq }) => eq(r.inviteCode, inviteCode.trim().toUpperCase()),
    });

    if (!room) {
      return { error: "招待コードが正しくないか、参加権限がありません" };
    }

    // スペースメンバーチェック
    const membership = await db.query.spaceMembers.findFirst({
      where: (m, { and, eq }) =>
        and(eq(m.spaceId, room.spaceId), eq(m.userId, user.id)),
    });

    if (!membership) {
      return { error: "招待コードが正しくないか、参加権限がありません" };
    }

    if (room.status !== "waiting") {
      return { error: "このルームはすでに開始されています" };
    }

    const currentPlayers = await db.query.roomPlayers.findMany({
      where: (rp, { eq }) => eq(rp.roomId, room.id),
    });

    if (currentPlayers.length >= 8) {
      return { error: "ルームは最大8人までです" };
    }

    // すでに参加しているかチェック
    const alreadyJoined = currentPlayers.some((p) => p.userId === user.id);
    if (alreadyJoined) {
      throw redirect(`/rooms/${room.id}`);
    }

    // 名前の重複チェック
    const nameDuplicate = currentPlayers.some(
      (p) => p.name.toLowerCase() === user.name.toLowerCase(),
    );

    if (nameDuplicate) {
      return { error: "このルームで同じ名前のプレイヤーがすでに参加しています" };
    }

    const now = new Date();
    await db.insert(schema.roomPlayers).values({
      id: crypto.randomUUID(),
      roomId: room.id,
      userId: user.id,
      name: user.name,
      seatOrder: currentPlayers.length + 1,
      joinedAt: now,
    });

    // 参加後にブロードキャスト
    const updatedPlayers = await db.query.roomPlayers.findMany({
      where: (rp, { eq }) => eq(rp.roomId, room.id),
      orderBy: (rp, { asc }) => asc(rp.seatOrder),
    });
    await broadcastRoomEvent(context.cloudflare.env, room.id, {
      type: "room.updated",
      roomId: room.id,
      players: updatedPlayers.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        seatOrder: p.seatOrder,
      })),
    });

    throw redirect(`/rooms/${room.id}`);
  }

  return { error: "不正なリクエストです" };
}

export default function SpaceHub({ loaderData, actionData }: Route.ComponentProps) {
  const { space, role, activeRooms } = loaderData;
  const isAdmin = role === "admin";
  const navigation = useNavigation();
  const isJoining = navigation.state === "submitting";
  const [urlCopied, setUrlCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="min-h-screen bg-[#f9f9f7]">
      <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
        {/* パンくず */}
        <div>
          <a
            href="/spaces"
            className="text-sm text-[#880069] hover:underline flex items-center gap-1 font-medium"
          >
            &larr; スペース一覧
          </a>
        </div>

        {/* スペース名 */}
        <div className="flex items-center gap-3">
          <h1
            className="text-3xl font-bold text-[#1a1c1b]"
            style={{ fontFamily: "Quicksand" }}
          >
            {space.name}
          </h1>
          {isAdmin && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[#ff71ce] border-2 border-[#1a1c1b]">
              管理者
            </span>
          )}
        </div>

        {/* アクティブなゲーム */}
        <section>
          <h2
            className="text-xs font-bold text-[#1a1c1b]/60 uppercase tracking-widest mb-3"
            style={{ fontFamily: "Quicksand" }}
          >
            アクティブなゲーム
          </h2>
          {activeRooms.length === 0 ? (
            <div className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow p-6 text-center">
              <p className="text-[#1a1c1b]/40 text-sm">現在進行中のゲームはありません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeRooms.map((room) => (
                <a
                  key={room.id}
                  href={`/rooms/${room.id}`}
                  className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow p-4 flex items-center justify-between hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#1a1c1b] transition-all block"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="font-bold text-[#880069] tracking-widest"
                      style={{ fontFamily: "Quicksand" }}
                    >
                      {room.inviteCode}
                    </span>
                    <span className="text-[#1a1c1b]/50 text-sm">
                      {room.players.length} 人参加中
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border-2 border-[#1a1c1b] ${
                      room.status === "waiting"
                        ? "bg-[#e7e482] text-[#1a1c1b]"
                        : "bg-[#00bd76] text-white"
                    }`}
                  >
                    {room.status === "waiting" ? "待機中" : "プレイ中"}
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* ゲームに参加 */}
        <section>
          <h2
            className="text-xs font-bold text-[#1a1c1b]/60 uppercase tracking-widest mb-3"
            style={{ fontFamily: "Quicksand" }}
          >
            ゲームに参加
          </h2>
          <div className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow p-6 space-y-4">
            {/* 新しいゲームを始める */}
            <a
              href={`/rooms/new?spaceId=${space.id}`}
              className="w-full flex items-center justify-between bg-[#880069] text-white border-4 border-[#1a1c1b] rounded-full px-5 py-4 font-bold neo-shadow hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#1a1c1b] transition-all"
            >
              <span className="flex items-center gap-2">
                <Play size={18} />
                新しいゲームを始める
              </span>
              <ArrowRight size={18} className="text-white/70" />
            </a>

            {/* 招待コードで参加 */}
            <div>
              <p
                className="text-sm font-bold text-[#1a1c1b] mb-2"
                style={{ fontFamily: "Quicksand" }}
              >
                招待コードで参加
              </p>
              {actionData?.error && (
                <div className="bg-red-50 border-2 border-red-400 text-red-700 px-3 py-2 rounded-xl text-sm mb-3">
                  {actionData.error}
                </div>
              )}
              <Form method="post" className="flex gap-2">
                <input type="hidden" name="intent" value="join" />
                <input
                  name="inviteCode"
                  placeholder="ABC123"
                  maxLength={6}
                  required
                  className="flex-1 uppercase tracking-widest font-bold text-center border-2 border-[#1a1c1b] rounded-full px-3 py-3 text-lg focus:outline-none focus:border-[#880069]"
                  style={{ textTransform: "uppercase", fontFamily: "Quicksand" }}
                />
                <button
                  type="submit"
                  disabled={isJoining}
                  className="bg-[#e7e482] border-4 border-[#1a1c1b] text-[#1a1c1b] px-5 py-3 rounded-full font-bold neo-shadow hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#1a1c1b] transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {isJoining ? "..." : "参加"}
                </button>
              </Form>
              <p className="text-xs text-[#1a1c1b]/40 mt-1">招待コードは6文字英数字</p>
            </div>
          </div>
        </section>

        {/* スペース管理（adminのみ） */}
        {isAdmin && (
          <section>
            <h2
              className="text-xs font-bold text-[#1a1c1b]/60 uppercase tracking-widest mb-3"
              style={{ fontFamily: "Quicksand" }}
            >
              スペース管理
            </h2>
            <div className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow p-6">
              <div className="flex flex-wrap gap-3">
                <a
                  href={`/spaces/${space.id}/admin/cards`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#f9f9f7] border-2 border-[#1a1c1b] rounded-full text-sm font-bold text-[#1a1c1b] transition-colors"
                >
                  <LayoutList size={15} /> カード管理
                </a>
                <a
                  href={`/spaces/${space.id}/invite`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#f9f9f7] border-2 border-[#1a1c1b] rounded-full text-sm font-bold text-[#1a1c1b] transition-colors"
                >
                  <Mail size={15} /> メンバー招待
                </a>
                <a
                  href={`/spaces/${space.id}/members`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#f9f9f7] border-2 border-[#1a1c1b] rounded-full text-sm font-bold text-[#1a1c1b] transition-colors"
                >
                  <Users size={15} /> メンバー一覧
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/spaces/${space.id}/join?token=${space.inviteToken}`;
                    navigator.clipboard?.writeText(url).then(() => setUrlCopied(true));
                    setTimeout(() => setUrlCopied(false), 2000);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#e7e482] border-2 border-[#1a1c1b] rounded-full text-sm font-bold text-[#1a1c1b] neo-shadow neo-shadow-active transition-all"
                >
                  <Link size={15} />
                  {urlCopied ? "コピーしました！" : "招待URLをコピー"}
                </button>
              </div>
              <div className="mt-4 pt-4 border-t border-[#1a1c1b]/10">
                {actionData?.error && (
                  <div className="bg-red-50 border-2 border-red-400 text-red-700 px-3 py-2 rounded-xl text-sm mb-3">
                    {actionData.error}
                  </div>
                )}
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm text-red-500 hover:text-red-700 font-medium"
                  >
                    スペースを削除
                  </button>
                ) : (
                  <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3">
                    <p className="text-sm font-bold text-red-700 mb-2">本当に削除しますか？この操作は取り消せません。</p>
                    <div className="flex gap-2">
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete" />
                        <button type="submit" className="px-3 py-1.5 bg-red-500 text-white text-sm font-bold rounded-full border-2 border-red-700">
                          削除する
                        </button>
                      </Form>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-3 py-1.5 bg-white text-gray-700 text-sm font-bold rounded-full border-2 border-gray-300"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 非admin向けメンバー一覧リンク */}
        {!isAdmin && (
          <div>
            <a
              href={`/spaces/${space.id}/members`}
              className="text-sm text-[#880069] hover:underline font-medium"
            >
              メンバー一覧を見る →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
