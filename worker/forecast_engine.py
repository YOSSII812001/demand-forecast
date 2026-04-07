"""TimesFM推論エンジン"""

import numpy as np
import timesfm

from config import TIMESFM_MODEL, QUANTILES


class ForecastEngine:
    """TimesFMモデルをロードし、時系列データの予測を実行する"""

    def __init__(self):
        self.model = None

    def load_model(self):
        """モデルをロード（初回のみ、起動時に1回実行）"""
        print(f"TimesFMモデルをロード中: {TIMESFM_MODEL}")
        self.model = timesfm.TimesFM.from_pretrained(TIMESFM_MODEL)
        print("モデルロード完了")

    def forecast(
        self,
        historical_values: list[float],
        horizon: int = 30,
        frequency: str = "daily",
    ) -> dict:
        """
        時系列データの予測を実行

        Args:
            historical_values: 過去の数値データ（時系列順）
            horizon: 予測日数
            frequency: データの頻度 ("daily" or "weekly")

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

        # TimesFMの周波数マッピング
        freq_map = {"daily": 1, "weekly": 2}
        freq = freq_map.get(frequency, 1)

        # 予測実行
        point_forecast, quantile_forecast = self.model.forecast(
            [input_array],
            freq=[freq],
            prediction_length=horizon,
            quantiles=QUANTILES,
        )

        # 結果を抽出（バッチサイズ1なので[0]）
        points = point_forecast[0].tolist()

        # quantile_forecastの構造: [batch, quantiles, horizon]
        q10 = quantile_forecast[0][0].tolist()  # 10%分位
        q90 = quantile_forecast[0][2].tolist()  # 90%分位

        return {
            "point_estimates": points[:horizon],
            "quantile_10": q10[:horizon],
            "quantile_90": q90[:horizon],
        }
