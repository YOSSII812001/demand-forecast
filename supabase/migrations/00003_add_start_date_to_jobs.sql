-- 00003_add_start_date_to_jobs.sql
-- 予測起点日をジョブに保存（UIのカレンダーピッカーから指定）

ALTER TABLE public.forecast_jobs
  ADD COLUMN start_date DATE;

COMMENT ON COLUMN public.forecast_jobs.start_date IS '予測起点日（この日の翌日から予測開始）。NULLの場合はデータの最終日を使用';
