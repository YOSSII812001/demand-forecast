"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  INSIGHT_CATEGORY_LABELS,
  type Insight,
  type InsightCategory,
} from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, DollarSign, ShoppingCart, Megaphone } from "lucide-react";

const CATEGORY_ICONS: Record<InsightCategory, typeof Users> = {
  staffing: Users,
  pricing: DollarSign,
  inventory: ShoppingCart,
  marketing: Megaphone,
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-l-4 border-l-destructive",
  medium: "border-l-4 border-l-copper",
  low: "border-l-4 border-l-muted",
};

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: ryokan } = await supabase
        .from("ryokans")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (ryokan) {
        const { data } = await supabase
          .from("insights")
          .select("*")
          .eq("ryokan_id", ryokan.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (data) setInsights(data as Insight[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">インサイト</h1>
        <p className="text-muted-foreground">
          予測データに基づくアクション提案
        </p>
      </div>

      {insights.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>まだインサイトがありません。</p>
            <p className="text-sm mt-1">
              需要予測を実行すると、自動的にアクション提案が生成されます。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {insights.map((insight) => {
            const Icon =
              CATEGORY_ICONS[insight.category as InsightCategory] ?? Users;
            return (
              <Card
                key={insight.id}
                className={PRIORITY_STYLES[insight.priority] ?? ""}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icon className="h-4 w-4 text-copper" />
                      {insight.title}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Badge variant="outline">
                        {INSIGHT_CATEGORY_LABELS[
                          insight.category as InsightCategory
                        ] ?? insight.category}
                      </Badge>
                      <Badge
                        variant={
                          insight.priority === "high"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {insight.priority === "high"
                          ? "重要"
                          : insight.priority === "medium"
                            ? "通常"
                            : "低"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {insight.description}
                  </CardDescription>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(insight.created_at).toLocaleString("ja-JP")}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
