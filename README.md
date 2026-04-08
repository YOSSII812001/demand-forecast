# ryokan-forecast - 温泉旅館 需要予測システム

TimesFM（Google OSS時系列予測AI）を活用した温泉旅館向けの需要予測システムです。
過去の予約・稼働データから30〜90日先の稼働率・宿泊客数・売上を予測し、
人員配置・食材発注・価格戦略の最適化を支援します。

## 特徴

- **ゼロショット予測** — ファインチューニング不要。データを入れるだけで即座に予測
- **12特徴量の自動共変量** — 祝日・連休・天気・気温をアプリが自動補完
- **信頼区間付き** — 10%〜90%の確率分布で不確実性を可視化
- **カレンダー表示** — 月間ヒートマップで日次の需要を一目で把握
- **アクション提案** — 人員配置・価格設定・食材発注のインサイトを自動生成

## アーキテクチャ

```
Vercel (Next.js 16)  ←→  Supabase (PostgreSQL + Realtime)  ←→  Local Python Worker (TimesFM)
```

- **フロントエンド**: Next.js 16 App Router + shadcn/ui v4 + Tailwind CSS v4
- **デザイン**: Lovable DESIGN.md準拠（和紙クリーム+銅色テーマ）
- **DB**: Supabase（認証 + RLS + Realtime）
- **推論**: ローカルPython Worker（TimesFM 2.5 200M + 天気API + 祝日カレンダー）

## 前提条件

- **Node.js** 20+（LTS）
- **Python** 3.11（TimesFM互換性要件: < 3.12）
- **Docker Desktop**（ローカルSupabase用）
- **Git**

## セットアップ

### 1. Node.js依存インストール

```bash
npm install
```

### 2. ローカルSupabase起動

```bash
npx supabase start
```

起動後にURL・キーが表示されます。ポートはusaconと競合しないよう+100オフセット済み:

| サービス | ポート |
|---------|--------|
| API | 54421 |
| DB | 54422 |
| Studio | 54423 |
| Mail | 54424 |

### 3. 環境変数設定

`.env.local` を作成:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
NEXT_PUBLIC_SUPABASE_ANON_KEY=（npx supabase statusの出力からコピー）
SUPABASE_SERVICE_ROLE_KEY=（同上）
```

`worker/.env` も同様に作成:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
SUPABASE_SERVICE_ROLE_KEY=（同上）
```

### 4. Python環境セットアップ

```bash
cd worker
py -3.11 -m venv .venv

# Windows
.venv\Scripts\activate

# PyTorch CPU版
pip install torch --index-url https://download.pytorch.org/whl/cpu

# TimesFM（GitHub最新版が必要、PyPI版はv2 APIなし）
pip install "timesfm[torch] @ git+https://github.com/google-research/timesfm.git"

# その他
pip install supabase python-dotenv numpy pandas safetensors jax jaxlib openmeteo-requests requests-cache
```

### 5. 一括起動

```bash
start-dev.bat
```

Supabase → Next.js → Pythonワーカーが3ウィンドウで起動します。

### 6. 動作確認

1. http://localhost:3000/signup でアカウント作成
2. 設定ページで旅館情報を登録（名前・所在地・客室数）
3. `samples/sample_ryokan_2years.csv` をアップロード
4. 需要予測ページでメトリクス選択 → 予測開始
5. チャートまたはカレンダーで予測結果を確認

## 一括起動/停止

```bash
start-dev.bat    # Supabase + Next.js + Pythonワーカーを一括起動
stop-dev.bat     # Supabase停止（Dockerメモリ約2GB解放）
```

## 共変量（自動注入）

ユーザーのCSVに含まれていなくても、以下のデータをアプリが自動で予測に反映します:

| カテゴリ | 特徴量 | ソース |
|---------|--------|--------|
| カレンダー | 祝日16種・振替休日 | jp_holidays.py |
| カレンダー | GW・お盆・年末年始 | jp_holidays.py |
| カレンダー | 桜・紅葉シーズン | jp_holidays.py |
| 周期 | 曜日sin/cos・月sin/cos | jp_holidays.py |
| 気象 | 最高/最低気温 | Open-Meteo API |
| 気象 | 降水量・日照時間 | Open-Meteo API |

気象データは旅館の所在地から自動ジオコーディングし、正確な座標の天気を取得します。

### ネットワーク要件

気象データの取得にインターネット接続が必要です（Open-Meteo API）。

| 状態 | 使用される共変量 | 精度 |
|------|----------------|------|
| **オンライン** | 12特徴量（祝日+天気） | 最高 |
| **オフライン** | 8特徴量（祝日のみ） | 十分実用的 |

オフライン時は天気データの取得をスキップし、祝日・曜日・季節の共変量のみで予測を実行します（エラーにはなりません）。

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 16.2.2 (App Router, Turbopack) |
| UI | shadcn/ui v4 (@base-ui/react) + Tailwind CSS v4 |
| チャート | Recharts 3.8.0 |
| DB | Supabase (PostgreSQL + Auth + Realtime) |
| 予測エンジン | Google TimesFM 2.5 200M (PyTorch CPU) |
| 天気API | Open-Meteo（無料・APIキー不要） |

## ライセンス

TimesFM: Apache 2.0 License (Google Research)
