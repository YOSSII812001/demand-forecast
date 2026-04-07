"""TimesFM 2.5 推論エンジン（公式v2 API使用）"""

import numpy as np
import timesfm

from config import TIMESFM_MODEL


class ForecastEngine:
    """TimesFM 2.5モデルをロードし、時系列データの予測を実行する"""

    def __init__(self):
        self.model = None

    def load_model(self):
        """モデルをロード（初回はHugging Faceからダウンロード、2回目以降はキャッシュ）"""
        print(f"TimesFMモデルをロード中: {TIMESFM_MODEL}")

        # 公式v2 API: from_pretrained + compile
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
    ) -> dict:
        """
        時系列データの予測を実行

        Returns:
            dict: {
                "point_estimates": list[float],  # 中央値予測
                "quantile_10": list[float],       # 10%分位（下限）
                "quantile_90": list[float],       # 90%分位（上限）
            }
        """
        if self.model is None:
            raise RuntimeError("モデルが未ロードです。load_model()を先に実行してください。")

        input_array = np.array(historical_values, dtype=np.float32)

        # 予測実行
        point_forecast, quantile_forecast = self.model.forecast(
            horizon=horizon,
            inputs=[input_array],
        )

        # point_forecast: (1, horizon) → 中央値予測
        points = point_forecast[0].tolist()[:horizon]

        # quantile_forecast: (1, horizon, 11) → mean + 10th-90th percentiles
        # index 0=mean, 1=10th, 2=20th, ..., 5=50th(median), ..., 10=90th
        q10 = quantile_forecast[0, :horizon, 1].tolist()  # 10th percentile
        q90 = quantile_forecast[0, :horizon, 9].tolist()   # 90th percentile

        return {
            "point_estimates": points,
            "quantile_10": q10,
            "quantile_90": q90,
        }
