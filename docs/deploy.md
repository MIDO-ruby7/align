# デプロイ手順

## 概要

Align は Cloudflare Workers + D1 + Durable Objects で動作します。
デプロイは GitHub Actions で自動化されており、手動操作はロールバック時や初期セットアップ時のみ必要です。

## 環境一覧

| 環境 | ブランチ | Worker 名 | URL |
|------|----------|-----------|-----|
| Production | `main` | `align-production` | https://align.pages.dev |
| Preview | PR | `align-preview` | https://align-preview.pages.dev |
| Development | ローカル | `align` | http://localhost:8787 |

---

## GitHub Actions Secrets の設定

GitHub リポジトリの Settings > Secrets and variables > Actions に以下を登録します。

| Secret 名 | 説明 | 取得方法 |
|-----------|------|----------|
| `CLOUDFLARE_API_TOKEN` | Wrangler デプロイ用 API トークン | Cloudflare Dashboard > My Profile > API Tokens > Workers AI Template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID | Cloudflare Dashboard > 右サイドバー |
| `BETTER_AUTH_SECRET` | better-auth の署名シークレット | `openssl rand -hex 32` で生成 |

### Cloudflare Workers へのシークレット設定

GitHub Actions Secrets とは別に、Worker ランタイムで参照するシークレットは `wrangler secret` で登録します。

```bash
# Production
pnpm wrangler secret put BETTER_AUTH_SECRET --env production

# Preview
pnpm wrangler secret put BETTER_AUTH_SECRET --env preview
```

リポジトリに `.env` や `.dev.vars` をコミットしてはいけません（`.gitignore` で除外済み）。

---

## 自動デプロイフロー

### PR 作成時

1. CI ジョブ（`ci.yml`）が `typecheck → lint → test` を実行
2. Deploy ジョブ（`deploy.yml`）が Preview Worker へデプロイ
3. PR にプレビュー URL のコメントが投稿される

### main へのマージ時

1. CI ジョブが再実行
2. Deploy ジョブが Production Worker へデプロイ（`wrangler deploy --env production`）

---

## 初期セットアップ（初回のみ）

### 1. D1 データベースの作成

```bash
# Production DB
pnpm wrangler d1 create align-production

# Preview DB
pnpm wrangler d1 create align-preview
```

出力された `database_id` を `wrangler.toml` の該当プレースホルダーと差し替えます。

```toml
# wrangler.toml の production セクション
[[env.production.d1_databases]]
database_id = "<実際のID>"

# preview セクション
[[env.preview.d1_databases]]
database_id = "<実際のID>"
```

### 2. マイグレーションの適用

```bash
# Production
pnpm wrangler d1 migrations apply align-production --env production

# Preview
pnpm wrangler d1 migrations apply align-preview --env preview
```

### 3. 手動デプロイ確認

```bash
pnpm wrangler deploy --env production
```

---

## ロールバック手順

### 方法 1: 直前バージョンへの即時ロールバック

Cloudflare Workers の Deployments から前バージョンへロールバックできます。

```bash
# デプロイ履歴を確認
pnpm wrangler deployments list --env production

# 特定バージョンへロールバック
pnpm wrangler rollback <deployment-id> --env production
```

### 方法 2: Git リバートによるロールバック

```bash
# 問題のあるコミットを特定
git log --oneline main

# リバートコミットを作成
git revert <commit-sha>
git push origin main
```

`main` へ push されると自動デプロイが走り、リバート内容が反映されます。

### 方法 3: 緊急時の手動デプロイ

```bash
# 安全なコミットをチェックアウト
git checkout <safe-commit-sha>

# 手動デプロイ
pnpm build
pnpm wrangler deploy --env production
```

---

## ローカル開発

```bash
# 依存関係インストール
pnpm install

# 開発サーバー起動（ローカル D1 使用）
pnpm dev

# 型チェック
pnpm typecheck

# Lint
pnpm lint

# テスト
pnpm test
```

`.dev.vars` ファイルにローカル用のシークレットを設定します（`.dev.vars.example` を参照）。

---

## トラブルシューティング

### wrangler deploy が失敗する

- `CLOUDFLARE_API_TOKEN` の権限を確認（Workers Scripts:Edit, D1:Edit が必要）
- `CLOUDFLARE_ACCOUNT_ID` が正しいか確認

### D1 マイグレーションが失敗する

- `wrangler.toml` の `database_id` がプレースホルダーのままになっていないか確認
- `pnpm wrangler d1 info <database-name>` でデータベースの存在を確認

### Preview URL が生成されない

- `CLOUDFLARE_API_TOKEN` が GitHub Secrets に設定されているか確認
- `deploy.yml` の `deploy-preview` ステップのログを確認
