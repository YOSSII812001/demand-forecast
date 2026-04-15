import { AnalysisFactors } from "@/components/methodology/analysis-factors";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  Layers,
  GitBranch,
  Lock,
} from "lucide-react";

export default function MethodologyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">分析手法</h1>
        <p className="text-muted-foreground">
          予測エンジンの仕組みとデータの取り扱いについて
        </p>
      </div>

      {/* 分析要素（展開状態で表示） */}
      <AnalysisFactors collapsed={false} />

      {/* 予測の仕組み */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-5 w-5 text-copper" />
            予測の仕組み
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/40 border border-washi/50 space-y-2">
              <Badge variant="outline" className="text-xs">Step 1</Badge>
              <h4 className="font-semibold text-sm">パターン抽出</h4>
              <p className="text-xs text-muted-foreground">
                アップロードされた過去データから、曜日周期（7日）・月次周期（30日）・年次周期（365日）の
                パターンを自動検出します。TimesFMのパッチ機構（32日単位）が
                複数の時間スケールを同時に捉えます。
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40 border border-washi/50 space-y-2">
              <Badge variant="outline" className="text-xs">Step 2</Badge>
              <h4 className="font-semibold text-sm">基盤知識の転移</h4>
              <p className="text-xs text-muted-foreground">
                1,000億以上のデータポイントで事前学習されたTimesFMの知識を、
                お客様のデータに転移適用します。類似パターン（観光業の季節性、
                週末効果等）を自動で照合し、少ないデータでも高精度な予測を実現します。
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40 border border-washi/50 space-y-2">
              <Badge variant="outline" className="text-xs">Step 3</Badge>
              <h4 className="font-semibold text-sm">確率的予測</h4>
              <p className="text-xs text-muted-foreground">
                単一の予測値ではなく、10パーセンタイル（楽観）から90パーセンタイル（悲観）まで
                の確率分布を出力します。この信頼区間により、
                最悪ケースに備えた計画と最善ケースを活かした施策の両方が可能です。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 精度と限界 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-5 w-5 text-copper" />
            精度と限界
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 shrink-0 h-fit mt-0.5">
                得意
              </span>
              <div>
                <p className="font-medium">規則的な周期パターン</p>
                <p className="text-xs text-muted-foreground">
                  曜日効果、季節変動、年次トレンドなど繰り返しのあるパターンは高精度で予測します。
                  宿泊施設や店舗の稼働パターンはこの特性に強く合致します。
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 shrink-0 h-fit mt-0.5">
                注意
              </span>
              <div>
                <p className="font-medium">予測できない事象</p>
                <p className="text-xs text-muted-foreground">
                  過去データに存在しない事象（初めての感染症流行、自然災害、
                  近隣の大規模施設オープン等）は予測に反映されません。
                  予測はあくまで過去パターンの延長です。
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 shrink-0 h-fit mt-0.5">
                推奨
              </span>
              <div>
                <p className="font-medium">最適なデータ量</p>
                <p className="text-xs text-muted-foreground">
                  最低30日分、理想的には1〜2年分の日次データをご用意ください。
                  年次パターン（お盆・GW・年末年始）を正しく検出するには、
                  少なくとも1年分のデータが推奨されます。
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* データの取り扱い */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-5 w-5 text-copper" />
              データセキュリティ
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>
              アップロードされたデータはお客様のSupabaseデータベース内にのみ保存されます。
              外部サーバーへの送信は行いません。
            </p>
            <p>
              TimesFMモデルはお客様のPC上でローカル実行されるため、
              予約データがインターネットを経由することはありません。
            </p>
            <p>
              Row Level Security（RLS）により、他のユーザーからのデータアクセスは
              技術的に不可能です。
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-copper" />
              技術的背景
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>
              TimesFM（Time Series Foundation Model）はGoogleのAI研究チームが
              2024年に発表した時系列予測専用の基盤モデルです。
            </p>
            <p>
              ICML 2024（機械学習分野のトップ国際会議）に採択された査読済み論文に基づいており、
              従来の統計手法（ARIMA、Prophet等）を多くのベンチマークで上回る性能が実証されています。
            </p>
            <p>
              Apache 2.0ライセンスのオープンソースとして公開されており、
              商用利用が許可されています。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
