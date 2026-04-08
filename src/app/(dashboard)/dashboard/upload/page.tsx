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
      .maybeSingle();

    if (!ryokan) {
      setMessage("旅館情報を先に登録してください（設定ページ）");
      setState("error");
      return;
    }

    // 同じファイル名の既存データソースを削除（重複防止）
    await supabase
      .from("data_sources")
      .delete()
      .eq("ryokan_id", ryokan.id)
      .eq("file_name", file.name);

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

      {/* CSVの作り方ガイド */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CSVファイルの作り方</CardTitle>
          <CardDescription>
            Excelやスプレッドシートで以下の表を作成し、CSV形式で保存してください
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 表形式の例 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/60">
                  <th className="border border-washi px-3 py-2 text-left font-semibold">
                    日付
                  </th>
                  <th className="border border-washi px-3 py-2 text-right font-semibold">
                    稼働率（%）
                  </th>
                  <th className="border border-washi px-3 py-2 text-right font-semibold">
                    宿泊客数（人）
                  </th>
                  <th className="border border-washi px-3 py-2 text-right font-semibold">
                    売上（円）
                  </th>
                  <th className="border border-washi px-3 py-2 text-right font-semibold">
                    予約件数
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["2025-10-01", "72", "43", "1,280,000", "12"],
                  ["2025-10-02", "85", "51", "1,650,000", "15"],
                  ["2025-10-03", "65", "39", "1,100,000", "10"],
                  ["...", "...", "...", "...", "..."],
                ].map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={`border border-washi/50 px-3 py-1.5 ${
                          j === 0 ? "text-left" : "text-right"
                        } ${cell === "..." ? "text-center text-muted-foreground" : ""}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 列の説明 */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">
                必須の列
              </p>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2 text-xs">
                  <Badge variant="default" className="shrink-0 text-[10px]">必須</Badge>
                  <div>
                    <span className="font-medium">日付</span>
                    <span className="text-muted-foreground"> — 「2025-10-01」形式（年-月-日）</span>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <Badge variant="default" className="shrink-0 text-[10px]">必須</Badge>
                  <div>
                    <span className="font-medium">予測したい数値</span>
                    <span className="text-muted-foreground"> — 以下から1つ以上</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">
                使える列名（どちらでもOK）
              </p>
              <div className="space-y-1 text-xs">
                {[
                  { ja: "日付", en: "date" },
                  { ja: "稼働率", en: "occupancy_rate" },
                  { ja: "宿泊客数 / 宿泊者数", en: "guest_count" },
                  { ja: "売上 / 売上高", en: "revenue" },
                  { ja: "予約件数 / 予約数", en: "bookings" },
                ].map((col) => (
                  <div key={col.en} className="flex items-center gap-2">
                    <code className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                      {col.ja}
                    </code>
                    <span className="text-muted-foreground">または</span>
                    <code className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                      {col.en}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ヒント */}
          <div className="p-3 rounded-lg bg-copper/5 border border-copper/10 text-xs space-y-1">
            <p className="font-semibold text-copper">ヒント</p>
            <ul className="text-muted-foreground space-y-0.5">
              <li>- 全ての列を埋める必要はありません。稼働率だけ、売上だけでもOK</li>
              <li>- データは30日分以上あると予測精度が上がります（理想は1〜2年分）</li>
              <li>- 祝日・連休の情報はシステムが自動で補完するため、入力不要です</li>
              <li>- Excelの場合: 「名前を付けて保存」→「CSV（コンマ区切り）」を選択</li>
            </ul>
          </div>
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
