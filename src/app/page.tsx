import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-cream">
      <div className="text-center space-y-8 px-4 max-w-2xl">
        {/* ヒーロー */}
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight text-foreground">
            温泉旅館の
            <span className="text-copper">需要予測</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            過去の予約データから、AIが30〜90日先の稼働率・宿泊客数・売上を予測。
            <br />
            人員配置や食材発注の最適化を支援します。
          </p>
        </div>

        {/* CTA */}
        <div className="flex gap-4 justify-center">
          <Button render={<Link href="/login" />} size="lg">
            ログイン
          </Button>
          <Button render={<Link href="/signup" />} variant="outline" size="lg">
            新規登録
          </Button>
        </div>

        {/* 特徴 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8">
          {[
            {
              title: "ゼロショット予測",
              desc: "ファインチューニング不要。データを入れるだけで即座に予測。",
            },
            {
              title: "信頼区間付き",
              desc: "予測値だけでなく、上限・下限の範囲も表示。リスクを可視化。",
            },
            {
              title: "アクション提案",
              desc: "予測に基づく人員配置・価格設定・食材発注の具体的な提案。",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="p-6 rounded-xl border border-washi bg-card"
            >
              <h3 className="font-semibold text-foreground mb-2">
                {item.title}
              </h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
