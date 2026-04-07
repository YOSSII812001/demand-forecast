"""ワーカー設定"""

import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# TimesFM設定
TIMESFM_MODEL = "google/timesfm-2.5-200m-pytorch"
DEFAULT_HORIZON = 30
POLL_INTERVAL_SECONDS = 5

# ForecastConfig最適化パラメータ
MAX_CONTEXT = 1024      # 2年分(736日)をカバー（デフォルト512では不足）
MAX_HORIZON = 256       # 90日予測のAR多段デコードを削減（デフォルト128）
