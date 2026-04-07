"""
温泉旅館（30室）の2年分リアルサンプルデータ生成

特徴:
- 総客室30室、1室あたり平均1.3〜1.7名
- 連休パターン: 連休初日に予約集中、中日は満室維持、最終日は昼チェックアウトで低め
- 飛び石連休: 谷間の平日もブースト（有給取得率考慮）
- 季節性: 冬の温泉需要、夏休み、桜、紅葉、梅雨の落ち込み
- 曜日: 金土は高稼働、火水は最低
- 祝日・祝前日: 明確なスパイク
- 客単価: 繁忙期は高め（ダイナミックプライシング風）
"""

import random
import datetime
import csv
import sys

random.seed(42)
TOTAL_ROOMS = 30

# === 日本の祝日 ===
def get_holidays(year):
    """指定年の祝日リスト"""
    holidays = [
        (1, 1), (1, 2), (1, 3),      # 三が日
        (1, 13),                       # 成人の日（第2月曜近似）
        (2, 11),                       # 建国記念の日
        (2, 23),                       # 天皇誕生日
        (3, 20),                       # 春分の日
        (4, 29),                       # 昭和の日
        (5, 3), (5, 4), (5, 5),       # 憲法記念日、みどりの日、こどもの日
        (7, 15),                       # 海の日（第3月曜近似）
        (8, 11),                       # 山の日
        (9, 15),                       # 敬老の日（第3月曜近似）
        (9, 23),                       # 秋分の日
        (10, 14),                      # スポーツの日（第2月曜近似）
        (11, 3),                       # 文化の日
        (11, 23),                      # 勤労感謝の日
    ]
    result = set()
    for m, d in holidays:
        try:
            result.add(datetime.date(year, m, d))
        except ValueError:
            pass
    return result

ALL_HOLIDAYS = set()
for y in [2024, 2025, 2026]:
    ALL_HOLIDAYS |= get_holidays(y)


# === 特別期間の定義 ===
def get_period_boost(d):
    """特別期間のブースト係数（1.0=通常）"""
    m, day = d.month, d.day

    # 年末年始（12/28〜1/3）: 段階的に上昇→ピーク→下降
    if m == 12 and day == 28: return 1.25
    if m == 12 and day == 29: return 1.35
    if m == 12 and day == 30: return 1.45
    if m == 12 and day == 31: return 1.50  # 大晦日ピーク
    if m == 1 and day == 1: return 1.55    # 元日最高
    if m == 1 and day == 2: return 1.50
    if m == 1 and day == 3: return 1.35    # 3日は帰宅組

    # GW（4/28〜5/6）: 飛び石の谷間含む
    if m == 4 and day >= 28: return 1.30
    if m == 5 and day == 1: return 1.15    # 谷間（有給取得者は来る）
    if m == 5 and day == 2: return 1.20    # 谷間
    if m == 5 and day == 3: return 1.45    # 憲法記念日
    if m == 5 and day == 4: return 1.50    # みどりの日（ピーク）
    if m == 5 and day == 5: return 1.45    # こどもの日
    if m == 5 and day == 6: return 1.15    # 帰宅日

    # お盆（8/10〜8/16）: 最大のピーク
    if m == 8 and day == 10: return 1.30
    if m == 8 and day == 11: return 1.40   # 山の日
    if m == 8 and day == 12: return 1.50
    if m == 8 and day == 13: return 1.55   # お盆入り
    if m == 8 and day == 14: return 1.55   # ピーク
    if m == 8 and day == 15: return 1.50
    if m == 8 and day == 16: return 1.25   # 送り火、帰宅

    # 桜シーズン（3/25〜4/10）
    if (m == 3 and day >= 25) or (m == 4 and day <= 10):
        return 1.10

    # シルバーウィーク（9/14〜9/23）
    if m == 9 and 14 <= day <= 23: return 1.12

    # 紅葉シーズン（10/20〜11/15）
    if (m == 10 and day >= 20) or (m == 11 and day <= 15):
        return 1.08

    # 梅雨（6/10〜7/10）: 落ち込み
    if (m == 6 and day >= 10) or (m == 7 and day <= 10):
        return 0.85

    return 1.0


# === 月別ベース稼働率 ===
MONTH_BASE = {
    1: 0.50,   # 年始後落ち着く
    2: 0.42,   # 最閑散期（冬の温泉需要は週末のみ）
    3: 0.52,   # 春休み
    4: 0.58,   # 桜
    5: 0.55,   # GW後の反動
    6: 0.42,   # 梅雨
    7: 0.62,   # 夏休み前半
    8: 0.72,   # 夏休みピーク
    9: 0.52,   # 残暑→秋
    10: 0.58,  # 紅葉
    11: 0.50,  # 晩秋
    12: 0.52,  # 冬の温泉、年末上昇
}

# === 曜日係数 ===
DOW_FACTOR = {
    0: 0.78,  # 月（チェックアウト多い）
    1: 0.70,  # 火（最低）
    2: 0.70,  # 水（最低）
    3: 0.75,  # 木
    4: 0.92,  # 金（チェックイン多い）
    5: 1.00,  # 土（最高）
    6: 0.88,  # 日（チェックアウト日）
}


def generate():
    start = datetime.date(2024, 4, 1)
    end = datetime.date(2026, 4, 6)

    rows = []
    current = start
    while current <= end:
        dow = current.weekday()

        # ベース稼働率
        base_occ = MONTH_BASE[current.month]

        # 曜日効果
        base_occ *= DOW_FACTOR[dow]

        # 特別期間
        base_occ *= get_period_boost(current)

        # 祝日ブースト
        if current in ALL_HOLIDAYS:
            base_occ *= 1.22
        # 祝前日（平日のみ）
        tomorrow = current + datetime.timedelta(days=1)
        if tomorrow in ALL_HOLIDAYS and dow < 5:
            base_occ *= 1.12

        # 3連休の中日ブースト
        yesterday = current - datetime.timedelta(days=1)
        if yesterday in ALL_HOLIDAYS and tomorrow in ALL_HOLIDAYS:
            base_occ *= 1.08

        # 稼働率（%）に変換 + ノイズ
        occ_pct = base_occ * 100
        # 繁忙期はノイズ小（予約で埋まる）、閑散期はノイズ大（変動大）
        noise_scale = 3.0 if base_occ > 0.7 else 5.0
        occ_pct += random.gauss(0, noise_scale)
        occ_pct = max(12, min(100, occ_pct))

        # 稼働室数
        occupied_rooms = round(occ_pct / 100 * TOTAL_ROOMS)
        occupied_rooms = max(3, min(TOTAL_ROOMS, occupied_rooms))
        # 実稼働率に補正
        occ_pct = round(occupied_rooms / TOTAL_ROOMS * 100, 1)

        # 宿泊客数（1室あたり1.3〜1.7名、繁忙期は家族連れで多め）
        guests_per_room = 1.3 + random.uniform(0, 0.4)
        if current.month in [7, 8, 12, 1]:  # 夏休み・年末年始は家族連れ
            guests_per_room += 0.15
        guests = max(3, round(occupied_rooms * guests_per_room + random.gauss(0, 1)))

        # 客単価（季節・曜日で変動）
        base_price = 15000
        if current.month in [12, 1, 2]:
            base_price = 18500   # 冬の温泉プレミアム
        elif current.month in [7, 8]:
            base_price = 17500   # 夏休みプレミアム
        elif current.month in [3, 4, 10, 11]:
            base_price = 16000   # 桜・紅葉シーズン

        # 週末は高め
        if dow >= 4:
            base_price *= 1.10

        # 特別期間は割増
        period_boost = get_period_boost(current)
        if period_boost > 1.2:
            base_price *= 1.15  # 繁忙期割増

        price = base_price + random.gauss(0, 1200)
        revenue = max(50000, round(guests * price))

        # 予約件数（グループ客は1件で複数名）
        bookings = max(2, round(occupied_rooms * 0.75 + random.gauss(0, 1.2)))

        rows.append({
            "date": current.strftime("%Y-%m-%d"),
            "occupancy_rate": occ_pct,
            "guest_count": guests,
            "revenue": revenue,
            "bookings": bookings,
        })

        current += datetime.timedelta(days=1)

    return rows


if __name__ == "__main__":
    rows = generate()

    writer = csv.DictWriter(
        sys.stdout,
        fieldnames=["date", "occupancy_rate", "guest_count", "revenue", "bookings"],
    )
    writer.writeheader()
    writer.writerows(rows)
