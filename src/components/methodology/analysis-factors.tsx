"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronUp,
  BrainCircuit,
  Database,
  CloudSun,
  CalendarRange,
  TrendingUp,
  ShieldCheck,
  FlaskConical,
  BarChart3,
} from "lucide-react";

const ANALYSIS_SECTIONS = [
  {
    title: "学習済みデータソース",
    icon: Database,
    badge: "事前学習済み",
    badgeColor: "bg-emerald-100 text-emerald-800",
    description:
      "TimesFMは以下の大規模データで事前学習されており、季節性の強い業態のパターンを自動的に捉えます。",
    items: [
      "Google Trends（検索トレンドの季節性・周期性）",
      "Wikipedia閲覧数（イベント・季節による変動パターン）",
      "合成時系列データ（多様な周期パターン、トレンド、ノイズパターン）",
      "計1,000億以上のデータポイントで学習",
    ],
  },
  {
    title: "分析に使用するお客様のデータ",
    icon: BarChart3,
    badge: "入力データ",
    badgeColor: "bg-blue-100 text-blue-800",
    description:
      "アップロードされたCSVデータから以下のパターンを自動検出・学習します。",
    items: [
      "日次稼働率の推移（過去の実績値）",
      "宿泊客数の変動パターン",
      "売上高のトレンドと季節性",
      "予約件数の週次・月次周期",
    ],
  },
  {
    title: "自動検出されるパターン",
    icon: TrendingUp,
    badge: "自動検出",
    badgeColor: "bg-purple-100 text-purple-800",
    description:
      "データから以下のパターンをゼロショット（追加学習なし）で自動検出します。",
    items: [
      "曜日パターン（金土の高需要、火水の低需要）",
      "季節周期（夏休み・年末年始・GW・お盆のピーク）",
      "長期トレンド（年々の需要増減傾向）",
      "連休パターン（飛び石連休の谷間、帰宅日の急落）",
      "イベント前後の需要変動（紅葉・桜シーズン等）",
    ],
  },
  {
    title: "天候・気象データ",
    icon: CloudSun,
    badge: "自動適用中",
    badgeColor: "bg-emerald-100 text-emerald-800",
    description:
      "Open-Meteo API（無料・APIキー不要）を通じて、施設所在地の気象データを自動取得し共変量として注入しています。",
    items: [
      "最高気温・最低気温（℃） — 季節需要（冬の暖房需要、夏の冷房需要等）と相関",
      "降水量（mm） — 天候による来客数変動と相関",
      "日照時間（h） — 行楽需要・屋外イベントとの相関",
      "過去データ: Open-Meteo Archive API（1940年〜）",
      "未来データ: 16日先の天気予報を自動取得、16日超は過去平均で補完",
    ],
  },
  {
    title: "カレンダー・イベント情報",
    icon: CalendarRange,
    badge: "自動適用中",
    badgeColor: "bg-emerald-100 text-emerald-800",
    description:
      "日本の祝日・連休カレンダーをアプリに内蔵し、予測時に自動注入しています。ユーザーのCSVに祝日情報がなくても機能します。",
    items: [
      "国民の祝日16種（振替休日・ハッピーマンデー自動計算）",
      "GW（4/28〜5/6）・お盆（8/10〜8/16）・年末年始（12/28〜1/3）",
      "桜シーズン（3/25〜4/10）・紅葉シーズン（10/20〜11/15）",
      "シルバーウィーク（9/14〜9/23）",
      "曜日・月の周期エンコーディング（sin/cos変換で周期性を数値化）",
      "地域イベント（花火大会・祭り等）は将来対応予定",
    ],
  },
];

const MODEL_INFO = {
  name: "TimesFM 2.5",
  developer: "Google Research",
  paper: "ICML 2024 採択論文",
  params: "200M パラメータ",
  license: "Apache 2.0（商用利用可）",
  method: "Decoder-only Transformer（事前学習済み基盤モデル）",
};

export function AnalysisFactors({ collapsed = true }: { collapsed?: boolean }) {
  const [isOpen, setIsOpen] = useState(!collapsed);

  return (
    <Card className="border-copper/20">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-copper" />
            分析手法・入力データについて
          </div>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>
      {isOpen && (
        <CardContent className="space-y-6 pt-0">
          {/* モデル情報 */}
          <div className="p-4 rounded-lg bg-muted/40 border border-washi/50">
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical className="h-4 w-4 text-copper" />
              <span className="font-semibold text-sm">予測エンジン</span>
              <Badge variant="outline" className="text-xs">
                <ShieldCheck className="h-3 w-3 mr-1" />
                査読済み
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              {Object.entries(MODEL_INFO).map(([key, value]) => (
                <div key={key}>
                  <span className="text-muted-foreground block">
                    {
                      {
                        name: "モデル名",
                        developer: "開発元",
                        paper: "論文",
                        params: "規模",
                        license: "ライセンス",
                        method: "手法",
                      }[key]
                    }
                  </span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 分析要素セクション */}
          {ANALYSIS_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="flex items-center gap-2">
                <section.icon className="h-4 w-4 text-copper" />
                <span className="font-semibold text-sm">{section.title}</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${section.badgeColor}`}
                >
                  {section.badge}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pl-6">
                {section.description}
              </p>
              <ul className="space-y-1 pl-6">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="text-xs text-foreground/80 flex items-start gap-2"
                  >
                    <span className="text-copper mt-1 shrink-0">-</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* 精度に関する注記 */}
          <div className="text-[11px] text-muted-foreground leading-relaxed border-t border-washi/50 pt-4">
            <p>
              ※ 本システムの予測はTimesFM基盤モデルによる統計的推定であり、
              確実な将来を保証するものではありません。予測値は過去データに含まれるパターンに基づいており、
              未経験のイベント（自然災害、感染症等）による急激な変動は反映されません。
              経営判断の参考情報としてご活用ください。
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
