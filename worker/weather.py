"""
天候・気象データ取得モジュール（Open-Meteo API）

無料・APIキー不要・日本全域対応。
過去の実績天気 + 16日先の天気予報を取得し、TimesFMの共変量として注入する。

対応パラメータ:
  - 最高気温 / 最低気温（℃）
  - 降水量合計（mm）
  - 日照時間（h）
  - 降水確率（%、予報のみ）
"""

import datetime
from typing import Optional

import openmeteo_requests
import requests_cache
from openmeteo_sdk.WeatherApiResponse import WeatherApiResponse

# キャッシュ設定（同一リクエストを1時間キャッシュ）
_cache_session = requests_cache.CachedSession(".weather_cache", expire_after=3600)
_om = openmeteo_requests.Client(session=_cache_session)

# 日本の主要温泉地の座標（デフォルト: 草津温泉）
DEFAULT_LOCATIONS = {
    "kusatsu": {"lat": 36.6219, "lon": 138.5960, "name": "草津温泉"},
    "hakone": {"lat": 35.2326, "lon": 139.1070, "name": "箱根"},
    "beppu": {"lat": 33.2846, "lon": 131.4914, "name": "別府"},
    "atami": {"lat": 35.0964, "lon": 139.0718, "name": "熱海"},
    "noboribetsu": {"lat": 42.4588, "lon": 141.1658, "name": "登別"},
}


def fetch_historical_weather(
    start_date: str,
    end_date: str,
    latitude: float = 36.6219,
    longitude: float = 138.5960,
) -> dict[str, list[float]]:
    """
    過去の天気データを取得（Open-Meteo Archive API）

    Returns:
        {
            "temperature_max": [20.1, 22.3, ...],
            "temperature_min": [8.5, 10.2, ...],
            "precipitation_sum": [0.0, 5.2, ...],
            "sunshine_duration_h": [8.5, 3.2, ...],
        }
    """
    try:
        responses = _om.weather_api(
            "https://archive-api.open-meteo.com/v1/archive",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "start_date": start_date,
                "end_date": end_date,
                "daily": [
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "precipitation_sum",
                    "sunshine_duration",
                ],
                "timezone": "Asia/Tokyo",
            },
        )
        return _parse_daily_response(responses[0])
    except Exception as e:
        print(f"  天気データ取得エラー（過去）: {e}")
        return {}


def fetch_forecast_weather(
    num_days: int = 16,
    latitude: float = 36.6219,
    longitude: float = 138.5960,
) -> dict[str, list[float]]:
    """
    天気予報を取得（Open-Meteo Forecast API、最大16日先）

    Returns:
        同じ形式のdict
    """
    try:
        responses = _om.weather_api(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "daily": [
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "precipitation_sum",
                    "sunshine_duration",
                    "precipitation_probability_max",
                ],
                "timezone": "Asia/Tokyo",
                "forecast_days": min(num_days, 16),
            },
        )
        return _parse_daily_response(responses[0])
    except Exception as e:
        print(f"  天気データ取得エラー（予報）: {e}")
        return {}


def _parse_daily_response(response: WeatherApiResponse) -> dict[str, list[float]]:
    """Open-Meteoレスポンスをパース"""
    daily = response.Daily()
    if daily is None:
        return {}

    result = {}
    var_names = [
        "temperature_max",
        "temperature_min",
        "precipitation_sum",
        "sunshine_duration_h",
    ]

    for i, name in enumerate(var_names):
        try:
            values = daily.Variables(i).ValuesAsNumpy().tolist()
            # sunshine_durationは秒→時間に変換
            if name == "sunshine_duration_h":
                values = [v / 3600 if v is not None else 0.0 for v in values]
            # NaNを0で埋める
            values = [v if v == v else 0.0 for v in values]  # NaN check
            result[name] = values
        except Exception:
            pass

    # 降水確率（予報のみ、5番目の変数）
    try:
        precip_prob = daily.Variables(4).ValuesAsNumpy().tolist()
        precip_prob = [v if v == v else 0.0 for v in precip_prob]
        result["precipitation_probability"] = precip_prob
    except Exception:
        pass

    return result


def get_weather_covariates(
    history_start: str,
    history_end: str,
    forecast_start: str,
    forecast_days: int,
    latitude: float = 36.6219,
    longitude: float = 138.5960,
    backtest_mode: bool = False,
) -> dict[str, list[list[float]]]:
    """
    過去+未来の天気データを結合し、TimesFMのdynamic_numerical_covariatesとして返す。

    backtest_mode=True: テスト期間も実績天気(archive API)を使用（リーク防止）
    forecast_daysが16日超の場合、16日以降は過去同時期の平均で埋める。
    """
    print(f"  天気データ取得中（{latitude}, {longitude}）{'[バックテスト]' if backtest_mode else ''}...")

    # 過去データ
    hist = fetch_historical_weather(history_start, history_end, latitude, longitude)
    if not hist:
        print("  天気データ: 過去データ取得失敗、スキップ")
        return {}

    if backtest_mode:
        # バックテスト: テスト期間も実績天気を使用（予報APIは使わない→リーク防止）
        from datetime import datetime, timedelta
        fs = datetime.strptime(forecast_start, "%Y-%m-%d")
        fe = (fs + timedelta(days=forecast_days - 1)).strftime("%Y-%m-%d")
        forecast = fetch_historical_weather(forecast_start, fe, latitude, longitude)
    else:
        # 通常予測: 予報APIを使用
        forecast = fetch_forecast_weather(forecast_days, latitude, longitude)

    # 各特徴量について過去+未来を結合
    result = {}
    for key in ["temperature_max", "temperature_min", "precipitation_sum", "sunshine_duration_h"]:
        hist_vals = hist.get(key, [])
        forecast_vals = forecast.get(key, [])

        if not hist_vals:
            continue

        # 予報が足りない分（16日超）は過去平均で埋める
        if len(forecast_vals) < forecast_days:
            avg = sum(hist_vals) / len(hist_vals) if hist_vals else 0.0
            forecast_vals.extend([avg] * (forecast_days - len(forecast_vals)))

        combined = hist_vals + forecast_vals[:forecast_days]
        result[f"weather_{key}"] = [combined]

    if result:
        print(f"  天気データ: {len(result)}特徴量 取得成功")
    return result


if __name__ == "__main__":
    # テスト: 草津温泉の2026年3月の天気
    hist = fetch_historical_weather("2026-03-01", "2026-03-31")
    print(f"過去データ: {list(hist.keys())}")
    for k, v in hist.items():
        print(f"  {k}: {len(v)}日分, 例={v[:3]}")

    forecast = fetch_forecast_weather(7)
    print(f"\n予報データ: {list(forecast.keys())}")
    for k, v in forecast.items():
        print(f"  {k}: {len(v)}日分, 例={v[:3]}")
