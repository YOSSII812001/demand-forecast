"""TimesFM 2.5 推論エンジン（共変量対応版）"""

import numpy as np
import timesfm

from config import TIMESFM_MODEL
from jp_holidays import generate_covariates


class ForecastEngine:
    """TimesFM 2.5モデルをロードし、時系列データの予測を実行する"""

    def __init__(self):
        self.model = None

    def load_model(self):
        """モデルをロード（初回はHugging Faceからダウンロード、2回目以降はキャッシュ）"""
        print(f"TimesFMモデルをロード中: {TIMESFM_MODEL}")

        self.model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(
            TIMESFM_MODEL
        )
        self.model.compile(
            timesfm.ForecastConfig(
                max_context=512,
                max_horizon=128,
                normalize_inputs=True,
                use_continuous_quantile_head=True,
                infer_is_positive=True,
                per_core_batch_size=1,
            )
        )
        print("モデルロード完了")

    def forecast(
        self,
        historical_values: list[float],
        horizon: int = 30,
        frequency: str = "daily",
        start_date: str | None = None,
        history_start_date: str | None = None,
    ) -> dict:
        """
        時系列データの予測を実行（日本の祝日・連休を共変量として自動注入）

        Args:
            historical_values: 過去の数値データ（時系列順）
            horizon: 予測日数
            frequency: データの頻度 ("daily" or "weekly")
            start_date: 予測起点日（YYYY-MM-DD）。共変量生成に使用
            history_start_date: 過去データの開始日（YYYY-MM-DD）

        Returns:
            dict with point_estimates, quantile_10, quantile_90
        """
        if self.model is None:
            raise RuntimeError("モデルが未ロードです。load_model()を先に実行してください。")

        input_array = np.array(historical_values, dtype=np.float32)
        history_len = len(historical_values)

        # 共変量を生成（祝日・連休・曜日・月の周期エンコーディング）
        covariates = None
        if start_date:
            try:
                cov_list = generate_covariates(
                    start_date=start_date,
                    num_days=horizon,
                    include_history_start=history_start_date,
                    history_days=history_len if history_start_date else 0,
                )
                covariates = np.array(cov_list, dtype=np.float32)
                print(f"  共変量: {covariates.shape[1]}特徴量 x {covariates.shape[0]}日")
                print(f"    - 祝日, 週末, 連休, 季節ブースト, 曜日sin/cos, 月sin/cos")
            except Exception as e:
                print(f"  共変量生成エラー（無視して続行）: {e}")
                covariates = None

        # 予測実行
        if covariates is not None:
            try:
                point_forecast, quantile_forecast = self.model.forecast(
                    horizon=horizon,
                    inputs=[input_array],
                    covariates=[covariates],
                )
                print("  予測モード: 共変量あり（祝日・連休考慮）")
            except Exception as e:
                # 共変量が使えない場合はフォールバック
                print(f"  共変量付き予測エラー（フォールバック）: {e}")
                point_forecast, quantile_forecast = self.model.forecast(
                    horizon=horizon,
                    inputs=[input_array],
                )
                print("  予測モード: 共変量なし（フォールバック）")
        else:
            point_forecast, quantile_forecast = self.model.forecast(
                horizon=horizon,
                inputs=[input_array],
            )
            print("  予測モード: 共変量なし")

        # point_forecast: (1, horizon) → 中央値予測
        points = point_forecast[0].tolist()[:horizon]

        # quantile_forecast: (1, horizon, 11) → mean + 10th-90th percentiles
        q10 = quantile_forecast[0, :horizon, 1].tolist()
        q90 = quantile_forecast[0, :horizon, 9].tolist()

        return {
            "point_estimates": points,
            "quantile_10": q10,
            "quantile_90": q90,
        }
