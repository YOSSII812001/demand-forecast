# AI需要予測ワーカー

TimesFMを使用して需要予測を実行するローカルPythonワーカーです。

## 前提条件

- Python 3.11（TimesFMの互換性要件: < 3.12）
- 4GB以上のメモリ（モデルロード用）

## セットアップ

```bash
cd worker
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

## 環境変数

`.env` ファイルをworkerディレクトリに作成:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 実行

```bash
python worker.py
```

起動後、以下の処理を自動実行します:

1. TimesFM 2.5 200Mモデルをロード（初回は数分かかります）
2. Supabaseの`forecast_jobs`テーブルを5秒間隔で監視
3. `queued`ステータスのジョブを検出すると自動で予測を実行
4. 結果を`forecast_results`テーブルに書き戻し
5. ルールベースのインサイトを`insights`テーブルに生成

`Ctrl+C`で停止。

## モデルについて

- **モデル**: google/timesfm-2.5-200m-pytorch
- **サイズ**: 200Mパラメータ（CPU動作可能）
- **入力**: 過去の時系列数値データ（最低10件）
- **出力**: 点推定 + 10%/90%分位予測
