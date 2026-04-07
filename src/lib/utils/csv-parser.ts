import Papa from "papaparse";
import type { MetricType } from "@/lib/types/database";

export type ParsedRow = {
  date: string;
  metric_type: MetricType;
  value: number;
};

export type CsvParseResult = {
  rows: ParsedRow[];
  headers: string[];
  rawRowCount: number;
  dateRange: { start: string; end: string } | null;
  detectedMetrics: MetricType[];
  errors: string[];
};

// CSVヘッダーからメトリクスタイプを推定
const HEADER_MAPPING: Record<string, MetricType> = {
  occupancy_rate: "occupancy_rate",
  occupancy: "occupancy_rate",
  稼働率: "occupancy_rate",
  guest_count: "guest_count",
  guests: "guest_count",
  宿泊客数: "guest_count",
  宿泊者数: "guest_count",
  revenue: "revenue",
  売上: "revenue",
  売上高: "revenue",
  bookings: "bookings",
  予約件数: "bookings",
  予約数: "bookings",
};

export function parseCsv(file: File): Promise<CsvParseResult> {
  return new Promise((resolve) => {
    const errors: string[] = [];
    const rows: ParsedRow[] = [];
    let headers: string[] = [];
    const dates: string[] = [];
    const detectedMetrics = new Set<MetricType>();

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        headers = results.meta.fields ?? [];

        // 日付列を特定
        const dateHeader = headers.find(
          (h) =>
            h.toLowerCase() === "date" ||
            h === "日付" ||
            h.toLowerCase() === "日"
        );
        if (!dateHeader) {
          errors.push(
            "日付列が見つかりません。'date' または '日付' 列が必要です。"
          );
          resolve({
            rows: [],
            headers,
            rawRowCount: results.data.length,
            dateRange: null,
            detectedMetrics: [],
            errors,
          });
          return;
        }

        // メトリクス列を特定
        const metricColumns: { header: string; metric: MetricType }[] = [];
        for (const h of headers) {
          if (h === dateHeader) continue;
          const normalizedHeader = h.toLowerCase().trim();
          const metric = HEADER_MAPPING[normalizedHeader];
          if (metric) {
            metricColumns.push({ header: h, metric });
            detectedMetrics.add(metric);
          }
        }

        if (metricColumns.length === 0) {
          errors.push(
            "認識可能なメトリクス列がありません。occupancy_rate, guest_count, revenue, bookings のいずれかの列名を使用してください。"
          );
        }

        // 行を処理
        for (const row of results.data as Record<string, string>[]) {
          const dateStr = row[dateHeader]?.trim();
          if (!dateStr) continue;

          // 日付フォーマット検証（YYYY-MM-DD）
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            errors.push(`無効な日付形式: ${dateStr}（YYYY-MM-DD形式が必要）`);
            continue;
          }

          dates.push(dateStr);

          for (const { header, metric } of metricColumns) {
            const rawValue = row[header]?.trim();
            if (!rawValue) continue;
            const value = parseFloat(rawValue.replace(/,/g, ""));
            if (isNaN(value)) {
              errors.push(`${header}列の数値変換エラー: "${rawValue}"`);
              continue;
            }
            rows.push({ date: dateStr, metric_type: metric, value });
          }
        }

        // 日付範囲
        dates.sort();
        const dateRange =
          dates.length > 0
            ? { start: dates[0], end: dates[dates.length - 1] }
            : null;

        resolve({
          rows,
          headers,
          rawRowCount: results.data.length,
          dateRange,
          detectedMetrics: Array.from(detectedMetrics),
          errors: errors.slice(0, 10), // 最大10件
        });
      },
      error(err) {
        errors.push(`CSV解析エラー: ${err.message}`);
        resolve({
          rows: [],
          headers: [],
          rawRowCount: 0,
          dateRange: null,
          detectedMetrics: [],
          errors,
        });
      },
    });
  });
}
