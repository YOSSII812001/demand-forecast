"""
温泉旅館需要予測 - ローカルPythonワーカー

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


def fetch_historical_data(client, ryokan_id: str, metric_type: str) -> list[float]:
    """旅館の時系列データを日付順で取得"""
    result = (
        client.table("time_series_data")
        .select("date, value")
        .eq("ryokan_id", ryokan_id)
        .eq("metric_type", metric_type)
        .order("date")
        .execute()
    )
    if not result.data:
        return []
    return [float(row["value"]) for row in result.data]


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
                "ryokan_id": job["ryokan_id"],
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
        insight["ryokan_id"] = job["ryokan_id"]

    if insights:
        client.table("insights").insert(insights).execute()

    return len(insights)


def process_job(client, engine: ForecastEngine, job: dict):
    """1つのジョブを処理"""
    job_id = job["id"]
    print(f"\n--- ジョブ処理開始: {job_id} ---")
    print(f"  旅館: {job['ryokan_id']}, メトリクス: {job['metric_type']}, 期間: {job['horizon']}日")

    # ステータスを running に更新
    client.table("forecast_jobs").update(
        {"status": "running", "started_at": datetime.utcnow().isoformat()}
    ).eq("id", job_id).execute()

    # 過去データを取得
    historical = fetch_historical_data(client, job["ryokan_id"], job["metric_type"])
    if len(historical) < 10:
        raise ValueError(f"データ不足: {len(historical)}件（最低10件必要）")

    print(f"  過去データ: {len(historical)}件")

    # 最終日付を取得
    last_date_result = (
        client.table("time_series_data")
        .select("date")
        .eq("ryokan_id", job["ryokan_id"])
        .eq("metric_type", job["metric_type"])
        .order("date", desc=True)
        .limit(1)
        .execute()
    )
    last_date = last_date_result.data[0]["date"] if last_date_result.data else "2025-01-01"

    # TimesFM予測実行
    forecast = engine.forecast(
        historical_values=historical,
        horizon=job["horizon"],
        frequency=job.get("frequency", "daily"),
    )

    # 結果を保存
    n_results = save_forecast_results(client, job, forecast, last_date)
    print(f"  予測結果: {n_results}件保存")

    # インサイト生成
    n_insights = generate_insights(client, job, forecast)
    print(f"  インサイト: {n_insights}件生成")

    # ステータスを completed に更新
    client.table("forecast_jobs").update(
        {"status": "completed", "completed_at": datetime.utcnow().isoformat()}
    ).eq("id", job_id).execute()

    print(f"  [OK] ジョブ完了: {job_id}")


def main():
    print("=" * 50)
    print("温泉旅館 需要予測ワーカー 起動")
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
