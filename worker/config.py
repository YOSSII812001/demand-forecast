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

# 予測の分位点
QUANTILES = [0.1, 0.5, 0.9]
