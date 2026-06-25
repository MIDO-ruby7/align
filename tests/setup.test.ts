import { describe, it, expect } from "vitest";

describe("プロジェクト初期セットアップ", () => {
  it("基本的な算術演算が正しく動作すること", () => {
    expect(1 + 1).toBe(2);
  });

  it("環境がNode.js互換であること", () => {
    expect(typeof process).toBe("object");
  });
});
