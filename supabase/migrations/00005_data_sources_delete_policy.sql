-- 00005_data_sources_delete_policy.sql
-- 同じCSVの再アップロード時にdata_sourcesの古いレコードを削除できるようにする

CREATE POLICY "Users can delete own data sources"
  ON public.data_sources FOR DELETE
  USING (ryokan_id IN (SELECT id FROM public.ryokans WHERE user_id = auth.uid()));
