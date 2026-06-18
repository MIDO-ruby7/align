# Align - バリューカードゲーム

チームのバリューを共有するためのカードゲームアプリです。

## 技術スタック

- [React Router v7 (旧Remix)](https://reactrouter.com/) on Cloudflare Workers
- [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [better-auth](https://www.better-auth.com/)
- [Vitest](https://vitest.dev/)
- [pnpm](https://pnpm.io/)

## 開発手順

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 環境変数の設定

`.dev.vars.example` をコピーして `.dev.vars` を作成し、必要な値を設定します。

```bash
cp .dev.vars.example .dev.vars
# .dev.vars を編集して各値を設定する
```

### 3. マイグレーションの実行

```bash
# マイグレーション SQL の生成
pnpm db:generate

# ローカル D1 へのマイグレーション適用
pnpm db:migrate
```

### 4. ローカル開発サーバーの起動

```bash
pnpm dev
```

ブラウザで `http://localhost:5173` を開くと画面が表示されます。

### 5. 型チェック・リント・テスト

```bash
pnpm typecheck && pnpm lint && pnpm test
```

## ディレクトリ構成

```
align/
├── app/
│   ├── lib/
│   │   └── auth.server.ts  # better-auth 設定
│   ├── routes/
│   │   ├── home.tsx        # トップページ
│   │   └── api.auth.$.tsx  # better-auth ハンドラ (/api/auth/*)
│   ├── load-context.ts     # React Router コンテキスト型拡張
│   └── root.tsx
├── db/
│   ├── schema/
│   │   └── index.ts        # Drizzle スキーマ定義
│   └── migrations/         # 生成されたマイグレーション SQL
├── tests/
│   └── setup.test.ts       # セットアップ確認テスト
├── workers/
│   └── app.ts              # Cloudflare Workers エントリポイント
├── wrangler.toml           # Wrangler 設定 (D1, Durable Objects)
├── drizzle.config.ts       # Drizzle Kit 設定
└── .dev.vars.example       # 環境変数サンプル
```

## デプロイ

```bash
pnpm deploy
```

事前に Cloudflare の認証 (`wrangler login`) と D1 データベースの作成が必要です。
