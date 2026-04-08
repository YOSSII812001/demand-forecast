# 需要予測フラット化バグ調査

## 計画

- `forecast_engine.py` の `forecast()` と `backtest()` の出力処理差分を確認する
- TimesFM の `forecast()` / `forecast_with_covariates()` の戻り値形状を確認する
- 通常予測だけが通る日付計算と共変量生成の差を特定する
- `forecast_engine.py` と `worker.py` に最小修正を入れる
- 影響範囲を確認し、バックテスト側を壊していないことを検証する

## Next Steps

- 通常予測で使う履歴終端日と予測起点日の扱いを分離する
- 必要ならギャップ日数ぶんの予測を内部で先に進め、保存時には指定起点日に合わせる
- 修正後に shape 処理と backtest 経路を再確認する

## 進捗

- TimesFM のローカル実装を確認し、`forecast()` は `return_backcast=True` で `context+horizon`、`forecast_with_covariates()` は `horizon` のみを返すことを確認した
- `_extract_results()` の末尾切り出し自体は両 shape に対応できることを確認した
- 根本原因は shape 差ではなく、通常予測だけが `job.start_date` を履歴終端日としても使っていた点だった
- その結果、通常予測では実データ終端日と共変量の日付長がずれやすく、共変量付き推論が失敗して通常 `forecast()` にフォールバックしていた
- `forecast_engine.py` で実データ終端日と予測起点日を分離し、ギャップ日数ぶんを内部予測してから必要区間だけ返すように修正した
- `worker.py` で保存基準日を正規化し、実データ終端日を `forecast()` に明示的に渡すように修正した

## Next Tasks

- 実データで通常予測ジョブを 1 件流し、フラット化が解消したことを確認する
- 必要なら worker ログに共変量フォールバック発生有無を追加監視する
- UI 上の予測起点日説明が実装仕様と一致しているか別途確認する
