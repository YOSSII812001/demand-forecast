## スキル連携
@~/.claude/skills/ryokan-forecast/SKILL.md

# ryokan-forecast - 温泉旅館 需要予測システム

## 概要
TimesFM（Google OSS時系列予測AI）を活用した温泉旅館向け需要予測システム。
過去の予約・稼働データから30〜90日先の稼働率・宿泊客数・売上を予測する。

## アーキテクチャ
- **フロントエンド**: Next.js 16 App Router + shadcn/ui v4 + Tailwind CSS v4
- **DB**: Supabase (PostgreSQL + Auth + Realtime)
- **推論**: ローカルPython Worker (TimesFM 2.5 200M)
- **デプロイ**: Vercel

## 重要な技術的注意点

### Next.js 16
- `proxy.ts` を使用（`middleware.ts`は非推奨）
- 関数名は `proxy`（`middleware`ではない）
- `cookies()`, `headers()`, `params` はすべて async

### shadcn/ui v4
- `@base-ui/react` ベース（Radix UIではない）
- `asChild` は使えない → `render` プロップを使用
- 例: `<Button render={<Link href="/foo" />}>テキスト</Button>`

### Supabase
- フロントエンド: `@supabase/ssr` の `createBrowserClient` / `createServerClient`
- API Routes: `createAdminClient()` (Service Role Key, RLSバイパス)
- MVPはシングルテナント（user_id直接参照）

## よく使うコマンド

```bash
# 開発
npm run dev

# ビルド確認
npm run build

# リント
npm run lint

# Pythonワーカー起動
cd worker && python worker.py
```

## ポート
- **Next.js**: 3000番

## ディレクトリ構成
```
src/app/             # Next.js App Router ページ
src/components/      # React コンポーネント (shadcn/ui + カスタム)
src/lib/supabase/    # Supabase クライアント
src/lib/types/       # 型定義
src/lib/utils/       # ユーティリティ (CSV解析等)
worker/              # Python TimesFM ワーカー
supabase/migrations/ # DBマイグレーション
```

## デザイン
MUJI DESIGN.md 準拠 + 温泉旅館アクセント
- 背景: 白 (#fff) — MUJI標準
- テキスト: 暗グレー (#3c3c43) — MUJI（純黒ではない）
- プライマリ: 銅色 (#b87333) — 温泉旅館アクセント
- セカンダリ/ミュート: #f5f5f5 — MUJI Background Secondary
- アクセント: きなり色 (#f4eede) — MUJIきなり
- ボーダー: #d8d8d9 — MUJI Border
- 角丸: 0.25rem (4px) — MUJI控えめ
- フォント: Helvetica Neue, Arial, Noto Sans JP, Hiragino Kaku Gothic ProN
- line-height: 1.6統一、letter-spacing: normal（h3のみ0.1em）
- font-feature-settings: normal（paltなし）
