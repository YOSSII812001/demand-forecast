"""
日本の祝日・特別期間カレンダー

TimesFMのforecast_with_covariates()用に、
数値共変量（dynamic_numerical）とカテゴリ共変量（dynamic_categorical）を型分けして生成する。
"""

import datetime
import math
from typing import Optional


def _get_holidays(year: int) -> dict[datetime.date, str]:
    """指定年の日本の祝日を返す"""
    holidays = {}

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

    def nth_monday(y: int, month: int, n: int) -> datetime.date:
        first = datetime.date(y, month, 1)
        dow = first.weekday()
        first_monday = first + datetime.timedelta(days=(7 - dow) % 7)
        return first_monday + datetime.timedelta(weeks=n - 1)

    holidays[nth_monday(year, 1, 2)] = "成人の日"
    holidays[nth_monday(year, 7, 3)] = "海の日"
    holidays[nth_monday(year, 9, 3)] = "敬老の日"
    holidays[nth_monday(year, 10, 2)] = "スポーツの日"

    spring = 20
    autumn = 23
    holidays[datetime.date(year, 3, spring)] = "春分の日"
    holidays[datetime.date(year, 9, autumn)] = "秋分の日"

    extra = {}
    for d, name in holidays.items():
        if d.weekday() == 6:
            next_day = d + datetime.timedelta(days=1)
            while next_day in holidays:
                next_day += datetime.timedelta(days=1)
            extra[next_day] = f"{name}（振替休日）"
    holidays.update(extra)

    return holidays


def _get_special_periods(year: int) -> dict[datetime.date, dict]:
    """特別期間を返す"""
    periods = {}

    for d in range(28, 32):
        try:
            periods[datetime.date(year, 12, d)] = {"type": "nenmatsu", "boost": 0.4}
        except ValueError:
            pass
    for d in range(1, 4):
        periods[datetime.date(year, 1, d)] = {"type": "nenmatsu", "boost": 0.4}

    for d in range(28, 31):
        try:
            periods[datetime.date(year, 4, d)] = {"type": "gw", "boost": 0.3}
        except ValueError:
            pass
    for d in range(1, 7):
        periods[datetime.date(year, 5, d)] = {"type": "gw", "boost": 0.3}

    for d in range(10, 17):
        periods[datetime.date(year, 8, d)] = {"type": "obon", "boost": 0.5}

    for d in range(14, 24):
        try:
            periods[datetime.date(year, 9, d)] = {"type": "sw", "boost": 0.1}
        except ValueError:
            pass

    for d in range(25, 32):
        try:
            periods[datetime.date(year, 3, d)] = {"type": "sakura", "boost": 0.08}
        except ValueError:
            pass
    for d in range(1, 11):
        periods[datetime.date(year, 4, d)] = {"type": "sakura", "boost": 0.08}

    for d in range(20, 32):
        try:
            periods[datetime.date(year, 10, d)] = {"type": "koyo", "boost": 0.08}
        except ValueError:
            pass
    for d in range(1, 16):
        periods[datetime.date(year, 11, d)] = {"type": "koyo", "boost": 0.08}

    return periods


# 事前計算（全年度）
_ALL_HOLIDAYS: dict[datetime.date, str] = {}
_ALL_PERIODS: dict[datetime.date, dict] = {}
for _y in range(2023, 2028):
    _ALL_HOLIDAYS.update(_get_holidays(_y))
    _ALL_PERIODS.update(_get_special_periods(_y))


def generate_covariates_typed(
    start_date: str,
    num_days: int,
    include_history_start: Optional[str] = None,
    history_days: int = 0,
) -> dict:
    """
    forecast_with_covariates()用の型分け共変量を生成する。

    Returns:
        {
            "dynamic_numerical": {
                "season_boost": [[...]]    # 特別期間のブースト値(0.0-0.5)
                "dow_sin": [[...]],        # 曜日sin周期
                "dow_cos": [[...]],        # 曜日cos周期
                "month_sin": [[...]],      # 月sin周期
                "month_cos": [[...]],      # 月cos周期
            },
            "dynamic_categorical": {
                "is_holiday": [[...]],     # 祝日フラグ (0/1)
                "is_weekend": [[...]],     # 週末フラグ (0/1)
                "is_long_holiday": [[...]], # 大型連休フラグ (0/1)
            },
            "total_days": int,
            "num_features": 8,
        }
    """
    if include_history_start and history_days > 0:
        first_date = datetime.datetime.strptime(include_history_start, "%Y-%m-%d").date()
        total_days = history_days + num_days
    else:
        first_date = datetime.datetime.strptime(start_date, "%Y-%m-%d").date()
        total_days = num_days

    # 各特徴量の配列
    season_boost = []
    dow_sin = []
    dow_cos = []
    month_sin = []
    month_cos = []
    is_holiday = []
    is_weekend = []
    is_long_holiday = []

    for i in range(total_days):
        d = first_date + datetime.timedelta(days=i)
        dow = d.weekday()

        # カテゴリカル（int: 0 or 1）
        is_holiday.append(1 if d in _ALL_HOLIDAYS else 0)
        is_weekend.append(1 if dow >= 5 else 0)

        period = _ALL_PERIODS.get(d)
        long_types = {"nenmatsu", "gw", "obon"}
        is_long_holiday.append(1 if (period and period["type"] in long_types) else 0)

        # 数値
        season_boost.append(period["boost"] if period else 0.0)
        dow_sin.append(math.sin(2 * math.pi * dow / 7))
        dow_cos.append(math.cos(2 * math.pi * dow / 7))
        month_sin.append(math.sin(2 * math.pi * (d.month - 1) / 12))
        month_cos.append(math.cos(2 * math.pi * (d.month - 1) / 12))

    return {
        "dynamic_numerical": {
            "season_boost": [season_boost],
            "dow_sin": [dow_sin],
            "dow_cos": [dow_cos],
            "month_sin": [month_sin],
            "month_cos": [month_cos],
        },
        "dynamic_categorical": {
            "is_holiday": [is_holiday],
            "is_weekend": [is_weekend],
            "is_long_holiday": [is_long_holiday],
        },
        "total_days": total_days,
        "num_features": 8,
    }


if __name__ == "__main__":
    result = generate_covariates_typed("2026-04-28", 10)
    print(f"total_days: {result['total_days']}")
    print(f"dynamic_numerical keys: {list(result['dynamic_numerical'].keys())}")
    print(f"dynamic_categorical keys: {list(result['dynamic_categorical'].keys())}")
    print(f"season_boost sample: {result['dynamic_numerical']['season_boost'][0][:5]}")
    print(f"is_holiday sample: {result['dynamic_categorical']['is_holiday'][0][:5]}")
