"""
日本の祝日・特別期間カレンダー

アプリに組み込み、TimesFMのXReg（共変量）として自動注入する。
ユーザーのCSVに祝日情報がなくても予測精度を向上させる。
"""

import datetime
from typing import Optional


def _get_holidays(year: int) -> dict[datetime.date, str]:
    """指定年の日本の祝日を返す"""
    holidays = {}

    # 固定祝日
    fixed = [
        (1, 1, "元日"),
        (2, 11, "建国記念の日"),
        (2, 23, "天皇誕生日"),
        (4, 29, "昭和の日"),
        (5, 3, "憲法記念日"),
        (5, 4, "みどりの日"),
        (5, 5, "こどもの日"),
        (8, 11, "山の日"),
        (11, 3, "文化の日"),
        (11, 23, "勤労感謝の日"),
    ]
    for m, d, name in fixed:
        try:
            holidays[datetime.date(year, m, d)] = name
        except ValueError:
            pass

    # ハッピーマンデー（第N月曜）
    def nth_monday(year: int, month: int, n: int) -> datetime.date:
        first = datetime.date(year, month, 1)
        dow = first.weekday()  # 0=月
        first_monday = first + datetime.timedelta(days=(7 - dow) % 7)
        return first_monday + datetime.timedelta(weeks=n - 1)

    holidays[nth_monday(year, 1, 2)] = "成人の日"
    holidays[nth_monday(year, 7, 3)] = "海の日"
    holidays[nth_monday(year, 9, 3)] = "敬老の日"
    holidays[nth_monday(year, 10, 2)] = "スポーツの日"

    # 春分の日・秋分の日（近似計算）
    spring = 20 if year % 4 == 0 else 20
    autumn = 23 if year % 4 == 0 else 23
    holidays[datetime.date(year, 3, spring)] = "春分の日"
    holidays[datetime.date(year, 9, autumn)] = "秋分の日"

    # 振替休日: 祝日が日曜なら翌月曜
    extra = {}
    for d, name in holidays.items():
        if d.weekday() == 6:  # 日曜
            next_day = d + datetime.timedelta(days=1)
            while next_day in holidays:
                next_day += datetime.timedelta(days=1)
            extra[next_day] = f"{name}（振替休日）"
    holidays.update(extra)

    return holidays


def get_special_periods(year: int) -> dict[datetime.date, dict]:
    """特別期間（連休・繁忙期）を返す"""
    periods = {}

    # 年末年始（12/28〜1/3）
    for d in range(28, 32):
        try:
            dt = datetime.date(year, 12, d)
            periods[dt] = {"type": "nenmatsu_nenshi", "label": "年末年始", "boost": 0.4}
        except ValueError:
            pass
    for d in range(1, 4):
        periods[datetime.date(year, 1, d)] = {"type": "nenmatsu_nenshi", "label": "年末年始", "boost": 0.4}

    # GW（4/28〜5/6）
    for d in range(28, 31):
        try:
            periods[datetime.date(year, 4, d)] = {"type": "golden_week", "label": "GW", "boost": 0.3}
        except ValueError:
            pass
    for d in range(1, 7):
        periods[datetime.date(year, 5, d)] = {"type": "golden_week", "label": "GW", "boost": 0.3}

    # お盆（8/10〜8/16）
    for d in range(10, 17):
        periods[datetime.date(year, 8, d)] = {"type": "obon", "label": "お盆", "boost": 0.5}

    # シルバーウィーク（9/14〜9/23）
    for d in range(14, 24):
        try:
            periods[datetime.date(year, 9, d)] = {"type": "silver_week", "label": "SW", "boost": 0.1}
        except ValueError:
            pass

    # 桜シーズン（3/25〜4/10）
    for d in range(25, 32):
        try:
            periods[datetime.date(year, 3, d)] = {"type": "sakura", "label": "桜", "boost": 0.08}
        except ValueError:
            pass
    for d in range(1, 11):
        periods[datetime.date(year, 4, d)] = {"type": "sakura", "label": "桜", "boost": 0.08}

    # 紅葉シーズン（10/20〜11/15）
    for d in range(20, 32):
        try:
            periods[datetime.date(year, 10, d)] = {"type": "koyo", "label": "紅葉", "boost": 0.08}
        except ValueError:
            pass
    for d in range(1, 16):
        periods[datetime.date(year, 11, d)] = {"type": "koyo", "label": "紅葉", "boost": 0.08}

    return periods


def generate_covariates(
    start_date: str,
    num_days: int,
    include_history_start: Optional[str] = None,
    history_days: int = 0,
) -> list[list[float]]:
    """
    TimesFM XReg用の共変量配列を生成する。

    各日付に対して以下の特徴量を生成:
      [0] is_holiday      : 祝日なら1, それ以外0
      [1] is_weekend      : 土日なら1, それ以外0
      [2] is_long_holiday : 連休（GW/お盆/年末年始）なら1, それ以外0
      [3] season_boost    : 特別期間のブースト値（0.0〜0.5）
      [4] day_of_week_sin : 曜日のsin値（周期エンコーディング）
      [5] day_of_week_cos : 曜日のcos値
      [6] month_sin       : 月のsin値（年次周期）
      [7] month_cos       : 月のcos値

    Args:
        start_date: 予測起点日（YYYY-MM-DD）
        num_days: 予測日数
        include_history_start: 過去データの開始日（共変量を過去分も含める場合）
        history_days: 過去データの日数

    Returns:
        list[list[float]]: shape (total_days, 8) の共変量配列
    """
    import math

    # 全年度の祝日・特別期間を事前計算
    all_holidays: dict[datetime.date, str] = {}
    all_periods: dict[datetime.date, dict] = {}
    for y in range(2023, 2028):
        all_holidays.update(_get_holidays(y))
        all_periods.update(get_special_periods(y))

    # 日付範囲を決定
    if include_history_start and history_days > 0:
        first_date = datetime.datetime.strptime(include_history_start, "%Y-%m-%d").date()
        total_days = history_days + num_days
    else:
        first_date = datetime.datetime.strptime(start_date, "%Y-%m-%d").date()
        total_days = num_days

    covariates = []
    for i in range(total_days):
        d = first_date + datetime.timedelta(days=i)
        dow = d.weekday()  # 0=月, 6=日

        is_holiday = 1.0 if d in all_holidays else 0.0
        is_weekend = 1.0 if dow >= 5 else 0.0

        period = all_periods.get(d)
        is_long_holiday = 1.0 if (period and period["type"] in ["nenmatsu_nenshi", "golden_week", "obon"]) else 0.0
        season_boost = period["boost"] if period else 0.0

        # 周期エンコーディング
        dow_sin = math.sin(2 * math.pi * dow / 7)
        dow_cos = math.cos(2 * math.pi * dow / 7)
        month_sin = math.sin(2 * math.pi * (d.month - 1) / 12)
        month_cos = math.cos(2 * math.pi * (d.month - 1) / 12)

        covariates.append([
            is_holiday,
            is_weekend,
            is_long_holiday,
            season_boost,
            dow_sin,
            dow_cos,
            month_sin,
            month_cos,
        ])

    return covariates


# テスト用
if __name__ == "__main__":
    # 2026年のGW周辺をテスト
    covs = generate_covariates("2026-04-28", 10)
    print("date        | hol | wknd | long | boost | dow_sin")
    d = datetime.date(2026, 4, 28)
    for i, c in enumerate(covs):
        dt = d + datetime.timedelta(days=i)
        print(f"{dt} | {c[0]:.0f}   | {c[1]:.0f}    | {c[2]:.0f}    | {c[3]:.2f}  | {c[4]:+.2f}")
