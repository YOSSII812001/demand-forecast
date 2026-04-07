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

                print(f"  共変量: {covariates['num_features']}特徴量 x {covariates['total_days']}日")
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
