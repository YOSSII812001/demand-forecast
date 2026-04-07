"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseCsv, type CsvParseResult } from "@/lib/utils/csv-parser";
import { METRIC_LABELS, type MetricType } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Upload, FileCheck, AlertCircle } from "lucide-react";

type UploadState = "idle" | "parsing" | "preview" | "saving" | "done" | "error";

export default function UploadPage() {
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setState("parsing");
      setMessage(null);

      const result = await parseCsv(selectedFile);
      setParseResult(result);

      if (result.errors.length > 0 && result.rows.length === 0) {
        setState("error");
        setMessage(result.errors[0]);
      } else {
        setState("preview");
      }
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile?.name.endsWith(".csv")) {
        handleFileSelect(droppedFile);
      } else {
        setMessage("CSVファイルのみ対応しています");
      }
    },
    [handleFileSelect]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        handleFileSelect(selectedFile);
      }
    },
    [handleFileSelect]
  );

  async function handleSave() {
    if (!parseResult || !file) return;
    setState("saving");
    setMessage(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("認証エラー: 再ログインしてください");
      setState("error");
      return;
    }

    // ユーザーの旅館を取得
    const { data: ryokan } = await supabase
      .from("ryokans")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!ryokan) {
      setMessage("旅館情報を先に登録してください（設定ページ）");
      setState("error");
      return;
    }

    // データソースを登録
    const { data: ds, error: dsError } = await supabase
      .from("data_sources")
      .insert({
        ryokan_id: ryokan.id,
        file_name: file.name,
        file_size: file.size,
        row_count: parseResult.rawRowCount,
        date_range_start: parseResult.dateRange?.start ?? null,
        date_range_end: parseResult.dateRange?.end ?? null,
        columns: parseResult.headers.map((h) => ({
          name: h,
          type: "text",
          sample: "",
        })),
        status: "validated",
      })
      .select()
      .single();

    if (dsError) {
      setMessage(`データソース登録エラー: ${dsError.message}`);
      setState("error");
      return;
    }

    // 時系列データをバッチ挿入（upsert: 重複日付は上書き）
    const records = parseResult.rows.map((row) => ({
      ryokan_id: ryokan.id,
      data_source_id: ds.id,
      date: row.date,
      metric_type: row.metric_type,
      value: row.value,
    }));

    // 500件ずつバッチ挿入
    const BATCH_SIZE = 500;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("time_series_data")
        .upsert(batch, {
          onConflict: "ryokan_id,date,metric_type",
        });

      if (error) {
        setMessage(`データ保存エラー (batch ${i}): ${error.message}`);
        setState("error");
        return;
      }
    }

    setState("done");
    setMessage(
      `${records.length}件のデータを保存しました（${parseResult.detectedMetrics.map((m) => METRIC_LABELS[m]).join("・")}）`
    );
  }

  function handleReset() {
    setState("idle");
    setFile(null);
    setParseResult(null);
    setMessage(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">データ管理</h1>
        <p className="text-muted-foreground">
          過去の予約・稼働データをアップロード
        </p>
      </div>

      {/* サンプルCSV形式 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">対応するCSV形式</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
            {`date,occupancy_rate,guest_count,revenue
2025-10-01,72,43,1280000
2025-10-02,85,51,1650000
2025-10-03,65,39,1100000`}
          </pre>
          <p className="text-xs text-muted-foreground mt-2">
            列名: date（日付）, occupancy_rate（稼働率）, guest_count（宿泊客数）,
            revenue（売上）, bookings（予約件数）。日本語列名も対応。
          </p>
        </CardContent>
      </Card>

      {/* アップロードエリア */}
      <Card>
        <CardHeader>
          <CardTitle>CSVアップロード</CardTitle>
          <CardDescription>
            日次の稼働率・宿泊客数・売上データをCSV形式でアップロードしてください
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === "idle" && (
            <label
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-washi rounded-lg cursor-pointer hover:border-copper/50 transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                CSVファイルをドラッグ＆ドロップ、またはクリックして選択
              </p>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleInputChange}
              />
            </label>
          )}

          {state === "parsing" && (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              解析中...
            </div>
          )}

          {(state === "preview" || state === "saving") && parseResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-copper" />
                <span className="font-medium">{file?.name}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-lg font-bold">
                    {parseResult.rawRowCount}
                  </div>
                  <div className="text-xs text-muted-foreground">行数</div>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-lg font-bold">
                    {parseResult.rows.length}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    データポイント
                  </div>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-lg font-bold">
                    {parseResult.dateRange?.start ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">開始日</div>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-lg font-bold">
                    {parseResult.dateRange?.end ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">終了日</div>
                </div>
              </div>

              <div className="flex gap-2">
                {parseResult.detectedMetrics.map((m: MetricType) => (
                  <Badge key={m} variant="secondary">
                    {METRIC_LABELS[m]}
                  </Badge>
                ))}
              </div>

              {parseResult.errors.length > 0 && (
                <div className="text-sm text-destructive space-y-1">
                  {parseResult.errors.map((err, i) => (
                    <p key={i}>⚠ {err}</p>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  disabled={state === "saving"}
                >
                  {state === "saving" ? "保存中..." : "データを保存"}
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  キャンセル
                </Button>
              </div>
            </div>
          )}

          {state === "done" && (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <FileCheck className="h-12 w-12 text-copper" />
              <p className="text-copper font-medium">{message}</p>
              <Button variant="outline" onClick={handleReset}>
                別のファイルをアップロード
              </Button>
            </div>
          )}

          {state === "error" && (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-destructive text-sm">{message}</p>
              <Button variant="outline" onClick={handleReset}>
                やり直す
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
