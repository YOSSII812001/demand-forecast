// Supabaseテーブルの型定義（手動定義、将来supabase gen typesで自動生成可能）

export type Profile = {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type Ryokan = {
  id: string;
  user_id: string;
  name: string;
  location: string | null;
  total_rooms: number | null;
  room_types: RoomType[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RoomType = {
  name: string;
  count: number;
  price: number;
};

export type DataSource = {
  id: string;
  ryokan_id: string;
  file_name: string;
  file_size: number | null;
  row_count: number | null;
  date_range_start: string | null;
  date_range_end: string | null;
  columns: ColumnInfo[];
  status: "uploaded" | "validated" | "error";
  error_message: string | null;
  created_at: string;
};

export type ColumnInfo = {
  name: string;
  type: string;
  sample: string;
};

export type MetricType =
  | "occupancy_rate"
  | "guest_count"
  | "revenue"
  | "bookings";

export type TimeSeriesData = {
  id: number;
  ryokan_id: string;
  data_source_id: string | null;
  date: string;
  metric_type: MetricType;
  value: number;
  metadata: Record<string, unknown>;
};

export type ForecastJobStatus = "queued" | "running" | "completed" | "failed";

export type ForecastJob = {
  id: string;
  ryokan_id: string;
  metric_type: MetricType;
  horizon: number;
  frequency: "daily" | "weekly";
  start_date: string | null;
  status: ForecastJobStatus;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ForecastResult = {
  id: string;
  job_id: string;
  ryokan_id: string;
  metric_type: MetricType;
  forecast_date: string;
  point_estimate: number;
  quantile_10: number | null;
  quantile_90: number | null;
  created_at: string;
};

export type InsightCategory =
  | "staffing"
  | "pricing"
  | "inventory"
  | "marketing";

export type Insight = {
  id: string;
  job_id: string;
  ryokan_id: string;
  category: InsightCategory;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  date_range_start: string | null;
  date_range_end: string | null;
  created_at: string;
};

// メトリクスタイプの日本語ラベル
export const METRIC_LABELS: Record<MetricType, string> = {
  occupancy_rate: "稼働率",
  guest_count: "宿泊客数",
  revenue: "売上",
  bookings: "予約件数",
};

// インサイトカテゴリの日本語ラベル
export const INSIGHT_CATEGORY_LABELS: Record<InsightCategory, string> = {
  staffing: "人員配置",
  pricing: "価格設定",
  inventory: "食材・在庫",
  marketing: "マーケティング",
};
