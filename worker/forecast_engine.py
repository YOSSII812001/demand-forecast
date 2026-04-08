"""TimesFM 2.5 推論エンジン（フル最適化版）

レビュー結果に基づく改善:
- ForecastConfig: max_context=1024, max_horizon=256, fix_quantile_crossing=True
- 共変量: forecast_with_covariates() で正しく渡す（数値/カテゴリ型分け）
- return_backcast=True（共変量の前提条件）
- フォールバック: 共変量エラー時はforecast()に安全にフォールバック
"""

import numpy as np
import timesfm

from config import TIMESFM_MODEL, MAX_CONTEXT, MAX_HORIZON
from jp_holidays import generate_covariates_typed
from weather import get_weather_covariates


class ForecastEngine:
    """TimesFM 2.5モデルをロードし、時系列データの予測を実行する"""

    def __init__(self):
        self.model = None

    def load_model(self):
        """モデルをロード"""
        print(f"TimesFMモデルをロード中: {TIMESFM_MODEL}")

        self.model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(
            TIMESFM_MODEL
        )
        self.model.compile(
            timesfm.ForecastConfig(
                max_context=MAX_CONTEXT,                # 1024: 2年分カバー
                max_horizon=MAX_HORIZON,                # 256: 90日予測のAR段数削減
                normalize_inputs=True,                  # スケール正規化
                use_continuous_quantile_head=True,       # 滑らかな分位推定
                force_flip_invariance=True,              # 負値アフィン不変性
                infer_is_positive=True,                  # 非負制約（稼働率/客数/売上）
                fix_quantile_crossing=True,              # 分位点の逆転防止
                return_backcast=True,                    # 共変量使用の前提条件
                per_core_batch_size=1,                   # CPU単体
            )
        )
        print("モデルロード完了")
        print(f"  max_context={MAX_CONTEXT}, max_horizon={MAX_HORIZON}")
        print(f"  fix_quantile_crossing=True, return_backcast=True")

    def forecast(
        self,
        historical_values: list[float],
        horizon: int = 30,
        frequency: str = "daily",
        start_date: str | None = None,
        history_start_date: str | None = None,
        latitude: float = 36.6219,
        longitude: float = 138.5960,
    ) -> dict:
        """
        時系列データの予測を実行（共変量あり/なし自動切替）
        """
        if self.model is None:
            raise RuntimeError("モデルが未ロードです。load_model()を先に実行してください。")

        input_array = np.array(historical_values, dtype=np.float32)
        history_len = len(historical_values)

        # 共変量付き予測を試行
        if start_date:
            try:
                covariates = generate_covariates_typed(
                    start_date=start_date,
                    num_days=horizon,
                    include_history_start=history_start_date,
                    history_days=history_len if history_start_date else 0,
                )

                # 天気データを取得して数値共変量に追加
                if history_start_date and start_date:
                    weather_covs = get_weather_covariates(
                        history_start=history_start_date,
                        history_end=start_date,
                        forecast_start=start_date,
                        forecast_days=horizon,
                        latitude=latitude,
                        longitude=longitude,
                    )
                    covariates["dynamic_numerical"].update(weather_covs)

                num_numerical = len(covariates["dynamic_numerical"])
                num_categorical = len(covariates["dynamic_categorical"])
                print(f"  共変量: 数値{num_numerical} + カテゴリ{num_categorical} = {num_numerical + num_categorical}特徴量")
                print(f"    数値: {list(covariates['dynamic_numerical'].keys())}")
                print(f"    カテゴリ: {list(covariates['dynamic_categorical'].keys())}")

                # forecast_with_covariates(): 正しいv2 API
                point_forecast, quantile_forecast = self.model.forecast_with_covariates(
                    inputs=[input_array],
                    dynamic_numerical_covariates=covariates["dynamic_numerical"],
                    dynamic_categorical_covariates=covariates["dynamic_categorical"],
                    xreg_mode="xreg + timesfm",
                    normalize_xreg_target_per_input=True,
                    force_on_cpu=True,
                )

                print("  予測モード: forecast_with_covariates（祝日・連休考慮）")
                return self._extract_results(point_forecast, quantile_forecast, horizon)

            except Exception as e:
                print(f"  共変量付き予測エラー: {e}")
                print("  フォールバック: forecast()（共変量なし）")

        # フォールバック: 共変量なし
        point_forecast, quantile_forecast = self.model.forecast(
            horizon=horizon,
            inputs=[input_array],
        )
        print("  予測モード: forecast（共変量なし）")
        return self._extract_results(point_forecast, quantile_forecast, horizon)

    def backtest(
        self,
        historical_values: list[float],
        test_days: int = 30,
        history_start_date: str | None = None,
        latitude: float = 36.6219,
        longitude: float = 138.5960,
        on_progress: callable = None,
    ) -> dict:
        """
        バックテスト: 過去データの末尾test_days分を隠して予測し、精度を検証

        Args:
            historical_values: 全過去データ
            test_days: テスト期間日数（末尾からマスク）
            on_progress: progress(pct, msg)コールバック
        Returns:
            {mape, rmse, mae, daily_results: [{date, actual, predicted, q10, q90, error_pct}]}
        """
        if self.model is None:
            raise RuntimeError("モデルが未ロードです")

        total = len(historical_values)
        if total < test_days + 30:
            raise ValueError(f"データ不足: {total}件（テスト{test_days}日+学習30日以上必要）")

        # データ分割
        train = historical_values[: total - test_days]
        actual = historical_values[total - test_days :]

        if on_progress:
            on_progress(10, "データ分割完了")

        # 学習期間の終了日 & テスト期間の開始日を計算（共変量・天気用）
        from datetime import datetime, timedelta
        if history_start_date:
            start_dt = datetime.strptime(history_start_date, "%Y-%m-%d")
            train_end_dt = start_dt + timedelta(days=len(train) - 1)
            train_end = train_end_dt.strftime("%Y-%m-%d")
            # C-2修正: テスト期間は学習最終日の翌日から
            forecast_start_dt = train_end_dt + timedelta(days=1)
            forecast_start = forecast_start_dt.strftime("%Y-%m-%d")
        else:
            train_end = None
            forecast_start = None
            history_start_date = None

        if on_progress:
            on_progress(30, "共変量生成中...")

        # 予測実行（共変量付き、天気はbacktest_mode=True）
        input_array = np.array(train, dtype=np.float32)

        try:
            covariates = generate_covariates_typed(
                start_date=forecast_start or "2025-01-01",
                num_days=test_days,
                include_history_start=history_start_date,
                history_days=len(train) if history_start_date else 0,
            )

            # 天気データ（backtest_mode: 実績天気のみ使用）
            if history_start_date and forecast_start:
                from weather import get_weather_covariates
                weather_covs = get_weather_covariates(
                    history_start=history_start_date,
                    history_end=train_end,
                    forecast_start=forecast_start,
                    forecast_days=test_days,
                    latitude=latitude,
                    longitude=longitude,
                    backtest_mode=True,
                )
                covariates["dynamic_numerical"].update(weather_covs)

            if on_progress:
                on_progress(50, "TimesFM推論実行中...")

            point_forecast, quantile_forecast = self.model.forecast_with_covariates(
                inputs=[input_array],
                dynamic_numerical_covariates=covariates["dynamic_numerical"],
                dynamic_categorical_covariates=covariates["dynamic_categorical"],
                xreg_mode="xreg + timesfm",
                normalize_xreg_target_per_input=True,
                force_on_cpu=True,
            )
        except Exception as e:
            print(f"  共変量付きバックテストエラー: {e}、フォールバック")
            if on_progress:
                on_progress(50, "推論実行中（共変量なし）...")
            point_forecast, quantile_forecast = self.model.forecast(
                horizon=test_days,
                inputs=[input_array],
            )

        if on_progress:
            on_progress(80, "精度計算中...")

        # 結果抽出
        predicted = point_forecast[0].tolist()[:test_days]
        if quantile_forecast.ndim == 3:
            q10 = quantile_forecast[0, :test_days, 1].tolist()
            q90 = quantile_forecast[0, :test_days, 9].tolist()
        else:
            q10 = predicted
            q90 = predicted

        # 精度指標計算
        import math
        errors = []
        daily_results = []
        for i in range(min(test_days, len(actual), len(predicted))):
            a = actual[i]
            p = predicted[i]

            # C-1修正: actual≈0の場合のMAPE安全計算
            if abs(a) < 1e-6:
                error_pct = 0.0 if abs(p) < 1e-6 else 100.0
            else:
                error_pct = abs(a - p) / abs(a) * 100

            # 日付ラベル（C-2修正: forecast_start_dtベース）
            date_label = ""
            if forecast_start:
                dt = forecast_start_dt + timedelta(days=i)
                date_label = dt.strftime("%Y-%m-%d")

            daily_results.append({
                "date": date_label,
                "actual": round(a, 2),
                "predicted": round(p, 2),
                "q10": round(q10[i], 2) if i < len(q10) else None,
                "q90": round(q90[i], 2) if i < len(q90) else None,
                "error_pct": round(error_pct, 1),
            })
            errors.append((a, p))

        # I-1修正: 空リスト時の0除算防止
        n = len(errors)
        if n == 0:
            mape, rmse, mae = 0.0, 0.0, 0.0
        else:
            mape_vals = []
            for a, p in errors:
                if abs(a) < 1e-6:
                    mape_vals.append(0.0 if abs(p) < 1e-6 else 100.0)
                else:
                    mape_vals.append(abs(a - p) / abs(a) * 100)
            mape = sum(mape_vals) / n
            rmse = math.sqrt(sum((a - p) ** 2 for a, p in errors) / n)
            mae = sum(abs(a - p) for a, p in errors) / n

        if on_progress:
            on_progress(100, "完了")

        return {
            "mape": round(mape, 2),
            "rmse": round(rmse, 2),
            "mae": round(mae, 2),
            "test_days": test_days,
            "daily_results": daily_results,
        }

    def _extract_results(
        self, point_forecast: np.ndarray, quantile_forecast: np.ndarray, horizon: int
    ) -> dict:
        """予測結果を統一フォーマットで抽出"""
        points = point_forecast[0].tolist()[:horizon]

        # quantile_forecast: (batch, horizon, 11)
        # index 0=mean, 1=10th, 2=20th, ..., 5=50th(median), ..., 9=90th, 10=?
        if quantile_forecast.ndim == 3:
            q10 = quantile_forecast[0, :horizon, 1].tolist()
            q90 = quantile_forecast[0, :horizon, 9].tolist()
        else:
            # forecast_with_covariatesの戻り値が2Dの場合のフォールバック
            q10 = points  # 同じ値で埋める
            q90 = points

        return {
            "point_estimates": points,
            "quantile_10": q10,
            "quantile_90": q90,
        }
