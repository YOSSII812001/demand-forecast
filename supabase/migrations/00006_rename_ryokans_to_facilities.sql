-- 00006_rename_ryokans_to_facilities.sql
-- ryokans → facilities へテーブル・カラム・インデックスをリネーム

-- テーブル名
ALTER TABLE public.ryokans RENAME TO facilities;

-- カラム名 (5テーブル)
ALTER TABLE public.data_sources RENAME COLUMN ryokan_id TO facility_id;
ALTER TABLE public.time_series_data RENAME COLUMN ryokan_id TO facility_id;
ALTER TABLE public.forecast_jobs RENAME COLUMN ryokan_id TO facility_id;
ALTER TABLE public.forecast_results RENAME COLUMN ryokan_id TO facility_id;
ALTER TABLE public.insights RENAME COLUMN ryokan_id TO facility_id;

-- インデックス名
ALTER INDEX idx_ryokans_user_id RENAME TO idx_facilities_user_id;
ALTER INDEX idx_data_sources_ryokan RENAME TO idx_data_sources_facility;
ALTER INDEX idx_ts_data_ryokan_date RENAME TO idx_ts_data_facility_date;
ALTER INDEX idx_forecast_jobs_ryokan RENAME TO idx_forecast_jobs_facility;
ALTER INDEX idx_forecast_results_ryokan_date RENAME TO idx_forecast_results_facility_date;
ALTER INDEX idx_insights_ryokan RENAME TO idx_insights_facility;

-- トリガー名
ALTER TRIGGER set_ryokans_updated_at ON public.facilities RENAME TO set_facilities_updated_at;

-- RLSポリシー名
ALTER POLICY "Users can manage own ryokans" ON public.facilities RENAME TO "Users can manage own facilities";
