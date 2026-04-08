-- 00004_add_backtest_support.sql
-- バックテスト（予測精度検証）機能のサポート

-- forecast_jobs テーブル拡張
ALTER TABLE public.forecast_jobs
  ADD COLUMN job_type TEXT NOT NULL DEFAULT 'forecast'
    CHECK (job_type IN ('forecast', 'backtest')),
  ADD COLUMN progress INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN progress_message TEXT,
  ADD COLUMN test_days INTEGER;

COMMENT ON COLUMN public.forecast_jobs.job_type IS 'forecast: 需要予測, backtest: 精度検証';
COMMENT ON COLUMN public.forecast_jobs.progress IS '進捗率 0-100（Realtime通知用）';
COMMENT ON COLUMN public.forecast_jobs.progress_message IS '進捗メッセージ（例: 推論実行中...）';
COMMENT ON COLUMN public.forecast_jobs.test_days IS 'バックテスト: テスト期間の日数';

-- バックテスト結果テーブル
CREATE TABLE public.backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.forecast_jobs(id) ON DELETE CASCADE,
  ryokan_id UUID NOT NULL REFERENCES public.ryokans(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  mape NUMERIC,
  rmse NUMERIC,
  mae NUMERIC,
  test_days INTEGER NOT NULL,
  daily_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_backtest_results_job ON public.backtest_results(job_id);
CREATE INDEX idx_backtest_results_ryokan ON public.backtest_results(ryokan_id);

ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own backtest results"
  ON public.backtest_results FOR SELECT
  USING (ryokan_id IN (SELECT id FROM public.ryokans WHERE user_id = auth.uid()));
CREATE POLICY "Service can insert backtest results"
  ON public.backtest_results FOR INSERT
  WITH CHECK (true);
