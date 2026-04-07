"""
ジオコーディングモジュール（Open-Meteo Geocoding API）

旅館の所在地テキストから緯度経度を自動取得する。APIキー不要・無料。
長い地名は分割して段階的に検索（「群馬県草津町」→「草津町」→「草津」）。
"""

import json
import re
from urllib.request import urlopen, quote
from typing import Optional


def _search(query: str) -> Optional[dict]:
    """単一クエリでGeocoding API検索"""
    try:
        encoded = quote(query.strip())
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={encoded}&count=1&language=ja"
        resp = json.loads(urlopen(url, timeout=5).read())
        results = resp.get("results", [])
        if results:
            r = results[0]
            return {
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "name": f"{r.get('name', '')} ({r.get('admin1', '')})",
            }
    except Exception:
        pass
    return None


def geocode(location: str) -> Optional[dict]:
    """
    所在地テキストから緯度経度を取得（段階的検索）

    検索順:
    1. 原文そのまま（例: "群馬県草津町"）
    2. 都道府県を除去（例: "草津町"）
    3. 市区町村の「市」「町」「村」「区」を除去（例: "草津"）
    4. 「温泉」を除去（例: "草津温泉" → "草津"）
    """
    if not location or not location.strip():
        return None

    loc = location.strip()
    candidates = [loc]

    # 都道府県を除去
    # 特殊な都道府県名→県庁所在地マッピング
    PREF_TO_CAPITAL = {
        "北海道": "札幌市",
        "東京都": "東京",
        "大阪府": "大阪市",
        "京都府": "京都市",
    }

    pref_match = re.match(r"^(北海道|東京都|大阪府|京都府|(.{2,3})県)(.*)", loc)
    if pref_match:
        full_pref = pref_match.group(1)
        remainder = pref_match.group(3).strip() if pref_match.group(3) else ""
        pref_name = pref_match.group(2) or full_pref

        if remainder:
            candidates.append(remainder)
        elif full_pref in PREF_TO_CAPITAL:
            candidates.append(PREF_TO_CAPITAL[full_pref])
        else:
            candidates.append(f"{pref_name}市")

    # 市区町村サフィックスを除去
    for suffix in ["市", "町", "村", "区", "郡"]:
        for c in list(candidates):
            if c.endswith(suffix) and len(c) > 2:
                candidates.append(c[:-1])

    # 「温泉」を除去
    for c in list(candidates):
        if "温泉" in c:
            candidates.append(c.replace("温泉", ""))

    # 重複排除・空文字排除
    seen = set()
    unique = []
    for c in candidates:
        c = c.strip()
        if c and c not in seen:
            seen.add(c)
            unique.append(c)

    for query in unique:
        result = _search(query)
        if result:
            return result

    return None


if __name__ == "__main__":
    tests = ["群馬県草津町", "箱根", "別府温泉", "熱海市", "北海道登別市", "大分県由布市"]
    for t in tests:
        result = geocode(t)
        if result:
            print(f"{t} -> {result['name']} ({result['latitude']:.4f}, {result['longitude']:.4f})")
        else:
            print(f"{t} -> not found")
