import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingUp, Users, Hotel, CalendarDays } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="text-muted-foreground">
          旅館の需要予測サマリー
        </p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: "今週の予測稼働率",
            value: "—",
            icon: Hotel,
            desc: "データをアップロードして予測を開始",
          },
          {
            title: "予測宿泊客数",
            value: "—",
            icon: Users,
            desc: "次の7日間",
          },
          {
            title: "売上予測",
            value: "—",
            icon: TrendingUp,
            desc: "次の7日間",
          },
          {
            title: "次回予測更新",
            value: "—",
            icon: CalendarDays,
            desc: "予測ジョブ未実行",
          },
        ].map((item) => (
          <Card key={item.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {item.title}
              </CardTitle>
              <item.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.value}</div>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* プレースホルダー: 予測チャート */}
      <Card>
        <CardHeader>
          <CardTitle>稼働率推移</CardTitle>
          <CardDescription>
            過去データと予測値の比較（データアップロード後に表示）
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center text-muted-foreground">
          データをアップロードし、予測を実行するとチャートが表示されます
        </CardContent>
      </Card>
    </div>
  );
}
