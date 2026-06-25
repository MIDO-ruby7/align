# dev-loop — 自律開発改善ループ

`.claude/autopilot.json` を持つ任意のプロジェクトで動作する汎用開発改善ループ。
セキュリティ・依存関係・パフォーマンス・機能提案を自動化する。

## 引数

```
/dev-loop [focus]
```
- 省略 → 全項目実行
- `security` → セキュリティのみ
- `deps` → 依存関係のみ  
- `features` → 機能提案のみ

## 実行手順

### 1. 設定読み込み
```bash
CONFIG=$(cat .claude/autopilot.json)
BASE=$(echo "$CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin)['project']['baseBranch'])")
git checkout $BASE && git pull origin $BASE
```

### 2. セキュリティ監査
```bash
pnpm audit --json 2>/dev/null || npm audit --json 2>/dev/null
```

HIGH/CRITICAL が見つかった場合:
1. `pnpm audit fix` を試みる
2. `feature/$(date +%Y%m%d)-security-fix` ブランチを作成
3. GitHub Issue を起票（label: security, priority:high）
4. PR を作成 → `/security-review` でレビュー → ready に

### 3. 依存関係更新
```bash
npm outdated --json 2>/dev/null
```

パッチ/マイナーのみ自動更新:
```bash
npx npm-check-updates -u --target minor
pnpm install && pnpm test
```
テスト通過 → PR 作成。失敗 → revert して Issue 化。

### 4. 機能提案
```bash
gh issue list --label "feature request" --state open --json number,title,body
```

`.claude/autopilot.json` の `targetUser` と `project.description` を参考に、
ユーザーが喜ぶ機能を3〜5件提案。優先度最高の1件を Issue 化（label: feature, autopilot）。

### 5. レポート保存
`.claude/autopilot/reports/dev-loop-$(date +%Y-%m-%d).md` に記録。

## 安全ガード
- main/develop への直接 push 禁止（必ず PR）
- テスト失敗の変更は PR 作成しない
- 1回の実行で最大 PR 3件まで
