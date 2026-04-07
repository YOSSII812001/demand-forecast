-- 00002_create_forecast_tables.sql
-- 時系列データ・予測ジョブ・予測結果・インサイト

-- データソース（アップロードされたCSVファイル情報）
CREATE TABLE public.data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ryokan_id UUID NOT NULL REFERENCES public.ryokans(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  row_count INTEGER,
  date_range_start DATE,
  date_range_end DATE,
  columns JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'validated', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_sources_ryokan ON public.data_sources(ryokan_id);

ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own data sources"
  ON public.data_sources FOR ALL
  USING (ryokan_id IN (SELECT id FROM public.ryokans WHERE user_id = auth.uid()))
  WITH CHECK (ryokan_id IN (SELECT id FROM public.ryokans WHERE user_id = auth.uid()));

-- 時系列データ（正規化済み）
CREATE TABLE public.time_series_data (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ryokan_id UUID NOT NULL REFERENCES public.ryokans(id) ON DELETE CASCADE,
  data_source_id UUID REFERENCES public.data_sources(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  metric_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(ryokan_id, date, metric_type)
);

CREATE INDEX idx_ts_data_ryokan_date ON public.time_series_data(ryokan_id, date);
CREATE INDEX idx_ts_data_metric ON public.time_series_data(metric_type);

ALTER TABLE public.time_series_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own time series data"
  ON public.time_series_data FOR ALL
  USING (ryokan_id IN (SELECT id FROM public.ryokans WHERE user_id = auth.uid()))
  WITH CHECK (ryokan_id IN (SELECT id FROM public.ryokans WHERE user_id = auth.uid()));

-- 予測ジョブ（キュー）
CREATE TABLE public.forecast_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ryokan_id UUID NOT NULL REFERENCES public.ryokans(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  horizon INTEGER NOT NULL DEFAULT 30,
  frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (frequency IN ('daily', 'weekly')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_forecast_jobs_ryokan ON public.forecast_jobs(ryokan_id);
CREATE INDEX idx_forecast_jobs_status ON public.forecast_jobs(status);

ALTER TABLE public.forecast_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own forecast jobs"
  ON public.forecast_jobs FOR ALL
  USING (ryokan_id IN (SELECT id FROM public.ryokans WHERE user_id = auth.uid()))
  WITH CHECK (ryokan_id IN (SELECT id FROM public.ryokans WHERE user_id = auth.uid()));

-- 予測結果
CREATE TABLE public.forecast_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.forecast_jobs(id) ON DELETE CASCADE,
  ryokan_id UUID NOT NULL REFERENCES public.ryokans(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  forecast_date DATE NOT NULL,
  point_estimate NUMERIC NOT NULL,
  quantile_10 NUMERIC,
  quantile_90 NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_forecast_results_job ON public.forecast_results(job_id);
CREATE INDEX idx_forecast_results_ryokan_date ON public.forecast_results(ryokan_id, forecast_date);

ALTER TABLE public.forecast_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own forecast results"
  ON public.forecast_results FOR SELECT
  USING (ryokan_id IN (SELECT id FROM public.ryokans WHERE user_id = auth.uid()));
CREATE POLICY "Service can insert forecast results"
  ON public.forecast_results FOR INSERT
  WITH CHECK (true);

-- インサイト（予測から導出されるアクション提案）
CREATE TABLE public.insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.forecast_jobs(id) ON DELETE CASCADE,
  ryokan_id UUID NOT NULL REFERENCES public.ryokans(id) ON DELETE CASCADE,
  category TEXT NOT NULL
    CHECK (category IN ('staffing', 'pricing', 'inventory', 'marketing')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  date_range_start DATE,
  date_range_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_insights_ryokan ON public.insights(ryokan_id);
CREATE INDEX idx_insights_job ON public.insights(job_id);

ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own insights"
  ON public.insights FOR SELECT
  USING (ryokan_id IN (SELECT id FROM public.ryokans WHERE user_id = auth.uid()));
CREATE POLICY "Service can insert insights"
  ON public.insights FOR INSERT
  WITH CHECK (true);

-- Realtime有効化（予測ジョブのステータス変更をフロントエンドで検知）
ALTER PUBLICATION supabase_realtime ADD TABLE public.forecast_jobs;
