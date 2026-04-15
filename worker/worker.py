"""
AI需要予測 - ローカルPythonワーカー

Supabaseのforecast_jobsテーブルを監視し、
TimesFMで予測を実行して結果を書き戻す。

使い方:
  cd worker
  python -m venv .venv
  .venv\\Scripts\\activate    # Windows
  pip install -r requirements.txt
  python worker.py
"""

import time
import traceback
from datetime import datetime, timedelta

from supabase import create_client

from config import (
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    POLL_INTERVAL_SECONDS,
)
from forecast_engine import ForecastEngine


def create_supabase_client():
    """Service Roleキーでクライアント作成（RLSバイパス）"""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def fetch_queued_jobs(client):
    """キューに入っているジョブを取得"""
    result = (
        client.table("forecast_jobs")
        .select("*")
        .eq("status", "queued")
        .order("created_at")
        .limit(5)
        .execute()
    )
    return result.data or []


def fetch_historical_data(
    client, facility_id: str, metric_type: str
) -> tuple[list[float], str | None, str | None]:
    """施設の時系列データを日付順で取得（欠損日付の補完付き）

    Returns:
        (values, start_date, end_date) -補完済みデータと日付範囲
    """
    import pandas as pd

    result = (
        client.table("time_series_data")
        .select("date, value")
        .eq("facility_id", facility_id)
        .eq("metric_type", metric_type)
        .order("date")
        .execute()
    )
    if not result.data:
        return [], None, None

    df = pd.DataFrame(result.data)
    df["date"] = pd.to_datetime(df["date"])
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.set_index("date").sort_index()

    # 日次に補完（歯抜けの日付を埋める）
    df = df.asfreq("D")

    # 欠損値を線形補間 → 先頭/末尾は前方/後方充填
    df["value"] = df["value"].interpolate(method="linear").ffill().bfill()

    start = df.index[0].strftime("%Y-%m-%d")
    end = df.index[-1].strftime("%Y-%m-%d")
    values = df["value"].tolist()

    return values, start, end


def save_forecast_results(
    client,
    job: dict,
    forecast: dict,
    start_date: str,
):
    """予測結果をSupabaseに保存"""
    from datetime import datetime, timedelta

    base_date = datetime.strptime(start_date, "%Y-%m-%d")
    records = []

    for i, (point, q10, q90) in enumerate(
        zip(
            forecast["point_estimates"],
            forecast["quantile_10"],
            forecast["quantile_90"],
        )
    ):
        forecast_date = (base_date + timedelta(days=i + 1)).strftime("%Y-%m-%d")
        records.append(
            {
                "job_id": job["id"],
                "facility_id": job["facility_id"],
                "metric_type": job["metric_type"],
                "forecast_date": forecast_date,
                "point_estimate": round(point, 4),
                "quantile_10": round(q10, 4),
                "quantile_90": round(q90, 4),
            }
        )

    # バッチ挿入
    if records:
        client.table("forecast_results").insert(records).execute()

    return len(records)


def generate_insights(client, job: dict, forecast: dict):
    """ルールベースのインサイト生成"""
    points = forecast["point_estimates"]
    q90 = forecast["quantile_90"]
    metric = job["metric_type"]
    insights = []

    if metric == "occupancy_rate":
        # 高需要日の検出（90%以上）
        high_days = [i for i, v in enumerate(points) if v >= 90]
        if high_days:
            insights.append(
                {
                    "category": "staffing",
                    "title": "高稼働日の人員増加推奨",
                    "description": f"今後{len(high_days)}日間、稼働率90%超が予測されています。清掃・調理スタッフの増員を検討してください。",
                    "priority": "high",
                }
            )

        # 閑散期の検出（50%未満）
        low_days = [i for i, v in enumerate(points) if v < 50]
        if len(low_days) > 5:
            insights.append(
                {
                    "category": "marketing",
                    "title": "閑散期の集客施策を検討",
                    "description": f"今後{len(low_days)}日間、稼働率50%未満が予測されています。直前割プランやSNSキャンペーンの実施を検討してください。",
                    "priority": "medium",
                }
            )

        # 価格調整の提案
        avg_occupancy = sum(points) / len(points) if points else 0
        if avg_occupancy > 75:
            insights.append(
                {
                    "category": "pricing",
                    "title": "価格引き上げの余地あり",
                    "description": f"平均予測稼働率{avg_occupancy:.0f}%。需要が堅調なため、週末や繁忙日の客室単価引き上げを検討できます。",
                    "priority": "medium",
                }
            )

    elif metric == "guest_count":
        # 食材発注量の最適化
        avg_guests = sum(points) / len(points) if points else 0
        max_guests = max(points) if points else 0
        insights.append(
            {
                "category": "inventory",
                "title": "食材発注量の目安",
                "description": f"今後の平均予測宿泊客数: {avg_guests:.0f}人/日、最大: {max_guests:.0f}人/日。食材の仕入れ量を調整してください。",
                "priority": "medium",
            }
        )

    # インサイトをSupabaseに保存
    for insight in insights:
        insight["job_id"] = job["id"]
        insight["facility_id"] = job["facility_id"]

    if insights:
        client.table("insights").insert(insights).execute()

    return len(insights)


def process_job(client, engine: ForecastEngine, job: dict):
    """1つのジョブを処理"""
    from datetime import datetime

    job_id = job["id"]
    print(f"\n--- ジョブ処理開始: {job_id} ---")
    print(f"  施設: {job['facility_id']}, メトリクス: {job['metric_type']}, 期間: {job['horizon']}日")

    # ステータスを running に更新
    client.table("forecast_jobs").update(
        {"status": "running", "started_at": datetime.utcnow().isoformat()}
    ).eq("id", job_id).execute()

    # 過去データを取得（欠損日付は線形補間で自動補完）
    historical, history_start, history_end = fetch_historical_data(
        client, job["facility_id"], job["metric_type"]
    )
    if len(historical) < 10:
        raise ValueError(f"データ不足: {len(historical)}件（最低10件必要）")

    print(f"  過去データ: {len(historical)}件（{history_start} - {history_end}、欠損補完済み）")

    # 予測起点日: ジョブのstart_dateがあればそれを使い、なければデータの最終日
    if job.get("start_date"):
        requested_anchor_date = job["start_date"]
        print(f"  予測起点日（UI指定）: {requested_anchor_date}")
    else:
        requested_anchor_date = history_end or "2025-01-01"
        print(f"  予測起点日（データ最終日）: {requested_anchor_date}")

    forecast_anchor_date = requested_anchor_date
    if history_end and requested_anchor_date:
        history_end_dt = datetime.strptime(history_end, "%Y-%m-%d").date()
        requested_anchor_dt = datetime.strptime(
            requested_anchor_date, "%Y-%m-%d"
        ).date()
        if requested_anchor_dt < history_end_dt:
            forecast_anchor_date = history_end
            print(
                "  UI指定の予測起点日が実データ最終日より前のため、"
                f" {forecast_anchor_date} に補正"
            )
        elif requested_anchor_dt > history_end_dt:
            gap_days = (requested_anchor_dt - history_end_dt).days
            print(
                "  実データ最終日から予測起点日までのギャップ: "
                f"{gap_days}日"
            )

    # 施設の所在地から座標を取得（天気データ用）
    from geocoding import geocode
    lat, lon = 36.6219, 138.5960  # デフォルト: 草津温泉
    facility_result = (
        client.table("facilities")
        .select("location")
        .eq("id", job["facility_id"])
        .limit(1)
        .execute()
    )
    if facility_result.data and facility_result.data[0].get("location"):
        location_text = facility_result.data[0]["location"]
        geo = geocode(location_text)
        if geo:
            lat, lon = geo["latitude"], geo["longitude"]
            print(f"  所在地: {location_text} -> {geo['name']} ({lat:.4f}, {lon:.4f})")
        else:
            print(f"  所在地: {location_text}（座標取得失敗、デフォルト使用）")

    # TimesFM予測実行（祝日・連休・天気の共変量を自動注入）
    forecast = engine.forecast(
        historical_values=historical,
        horizon=job["horizon"],
        frequency=job.get("frequency", "daily"),
        start_date=forecast_anchor_date,
        history_start_date=history_start,
        history_end_date=history_end,
        latitude=lat,
        longitude=lon,
    )

    # 結果を保存
    n_results = save_forecast_results(client, job, forecast, forecast_anchor_date)
    print(f"  予測結果: {n_results}件保存")

    # インサイト生成
    n_insights = generate_insights(client, job, forecast)
    print(f"  インサイト: {n_insights}件生成")

    # ステータスを completed に更新
    client.table("forecast_jobs").update(
        {"status": "completed", "completed_at": datetime.utcnow().isoformat()}
    ).eq("id", job_id).execute()

    print(f"  [OK] ジョブ完了: {job_id}")


def process_backtest_job(client, engine: ForecastEngine, job: dict):
    """バックテストジョブを処理"""
    job_id = job["id"]
    test_days = job.get("test_days") or 30
    print(f"\n--- バックテスト開始: {job_id} ---")
    print(f"  施設: {job['facility_id']}, メトリクス: {job['metric_type']}, テスト期間: {test_days}日")

    def update_progress(pct: int, msg: str):
        client.table("forecast_jobs").update(
            {"progress": pct, "progress_message": msg}
        ).eq("id", job_id).execute()
        print(f"  進捗: {pct}% -{msg}")

    # ステータスを running に更新
    client.table("forecast_jobs").update(
        {"status": "running", "started_at": datetime.utcnow().isoformat(), "progress": 0}
    ).eq("id", job_id).execute()

    # 過去データ取得
    historical, history_start, history_end = fetch_historical_data(
        client, job["facility_id"], job["metric_type"]
    )
    if len(historical) < test_days + 30:
        raise ValueError(f"データ不足: {len(historical)}件（テスト{test_days}日+学習30日以上必要）")

    update_progress(5, f"過去データ: {len(historical)}件取得完了")

    # 施設の座標取得
    from geocoding import geocode
    lat, lon = 36.6219, 138.5960
    facility_result = (
        client.table("facilities")
        .select("location")
        .eq("id", job["facility_id"])
        .limit(1)
        .execute()
    )
    if facility_result.data and facility_result.data[0].get("location"):
        geo = geocode(facility_result.data[0]["location"])
        if geo:
            lat, lon = geo["latitude"], geo["longitude"]

    # バックテスト実行
    result = engine.backtest(
        historical_values=historical,
        test_days=test_days,
        history_start_date=history_start,
        latitude=lat,
        longitude=lon,
        on_progress=update_progress,
    )

    # 結果をDBに保存
    client.table("backtest_results").insert({
        "job_id": job_id,
        "facility_id": job["facility_id"],
        "metric_type": job["metric_type"],
        "mape": result["mape"],
        "rmse": result["rmse"],
        "mae": result["mae"],
        "test_days": test_days,
        "daily_results": result["daily_results"],
    }).execute()

    # ステータスを completed に更新
    client.table("forecast_jobs").update({
        "status": "completed",
        "completed_at": datetime.utcnow().isoformat(),
        "progress": 100,
        "progress_message": f"MAPE: {result['mape']}%",
    }).eq("id", job_id).execute()

    print(f"  [OK] バックテスト完了: MAPE={result['mape']}%, RMSE={result['rmse']}, MAE={result['mae']}")


def main():
    print("=" * 50)
    print("AI需要予測ワーカー 起動")
    print("=" * 50)

    # Supabase接続
    client = create_supabase_client()
    print("Supabase接続: OK")

    # TimesFMモデルロード
    engine = ForecastEngine()
    engine.load_model()

    print(f"ジョブ監視開始（{POLL_INTERVAL_SECONDS}秒間隔）...")
    print("Ctrl+C で停止\n")

    while True:
        try:
            jobs = fetch_queued_jobs(client)
            if jobs:
                print(f"キューにジョブ {len(jobs)}件 検出")
                for job in jobs:
                    try:
                        if job.get("job_type") == "backtest":
                            process_backtest_job(client, engine, job)
                        else:
                            process_job(client, engine, job)
                    except Exception as e:
                        print(f"  [ERR] ジョブエラー ({job['id']}): {e}")
                        traceback.print_exc()
                        client.table("forecast_jobs").update(
                            {
                                "status": "failed",
                                "error_message": str(e)[:500],
                                "completed_at": datetime.utcnow().isoformat(),
                            }
                        ).eq("id", job["id"]).execute()

            time.sleep(POLL_INTERVAL_SECONDS)

        except KeyboardInterrupt:
            print("\nワーカー停止")
            break
        except Exception as e:
            print(f"ポーリングエラー: {e}")
            traceback.print_exc()
            time.sleep(POLL_INTERVAL_SECONDS * 2)


if __name__ == "__main__":
    import sys
    # Windows環境でのバッファリング問題回避
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    main()
