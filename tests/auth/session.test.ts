import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireUser, getOptionalUser } from "../../app/lib/session.server";

// createAuth のモック
vi.mock("../../app/lib/auth.server", () => ({
  createAuth: vi.fn(),
}));

import { createAuth } from "../../app/lib/auth.server";

const mockContext = {
  cloudflare: {
    env: {
      DB: {},
      BETTER_AUTH_SECRET: "test-secret",
      BETTER_AUTH_URL: "http://localhost:5173",
    } as unknown as Env,
    ctx: {} as ExecutionContext,
  },
};

function makeRequest(cookie?: string): Request {
  const headers = new Headers();
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return new Request("http://localhost/spaces", { headers });
}

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未認証の場合は /login にリダイレクトする", async () => {
    vi.mocked(createAuth).mockReturnValue({
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as unknown as ReturnType<typeof createAuth>);

    const request = makeRequest();

    await expect(requireUser(request, mockContext)).rejects.toMatchObject({
      status: 302,
      headers: expect.objectContaining({}),
    });

    // リダイレクト先が /login であることを確認
    try {
      await requireUser(request, mockContext);
    } catch (response) {
      expect(response).toBeInstanceOf(Response);
      if (response instanceof Response) {
        expect(response.headers.get("location")).toBe("/login");
      }
    }
  });

  it("認証済みの場合はユーザーオブジェクトを返す", async () => {
    const mockUser = {
      id: "user-1",
      name: "テストユーザー",
      email: "test@example.com",
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(createAuth).mockReturnValue({
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: mockUser,
          session: { id: "session-1", token: "token-1" },
        }),
      },
    } as unknown as ReturnType<typeof createAuth>);

    const request = makeRequest("better-auth.session_token=valid-token");
    const user = await requireUser(request, mockContext);

    expect(user.id).toBe("user-1");
    expect(user.name).toBe("テストユーザー");
    expect(user.email).toBe("test@example.com");
  });
});

describe("getOptionalUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未認証の場合は null を返す", async () => {
    vi.mocked(createAuth).mockReturnValue({
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    } as unknown as ReturnType<typeof createAuth>);

    const request = makeRequest();
    const user = await getOptionalUser(request, mockContext);

    expect(user).toBeNull();
  });

  it("認証済みの場合はユーザーオブジェクトを返す", async () => {
    const mockUser = {
      id: "user-2",
      name: "別のユーザー",
      email: "another@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(createAuth).mockReturnValue({
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: mockUser,
          session: { id: "session-2", token: "token-2" },
        }),
      },
    } as unknown as ReturnType<typeof createAuth>);

    const request = makeRequest("better-auth.session_token=valid-token");
    const user = await getOptionalUser(request, mockContext);

    expect(user).not.toBeNull();
    expect(user?.id).toBe("user-2");
    expect(user?.email).toBe("another@example.com");
  });
});
