"use client";

import { useEffect, useRef } from "react";

const FACTS = [
  {
    label: "Google Research",
    text: "Googleが開発・オープンソース化した時系列予測基盤モデル",
  },
  {
    label: "1,000億+データポイント",
    text: "Google Trends、Wikipedia、合成データなど大規模実世界データで事前学習",
  },
  {
    label: "ゼロショット予測",
    text: "ファインチューニング不要。データを渡すだけで即座に高精度な予測を実行",
  },
  {
    label: "Apache 2.0ライセンス",
    text: "商用利用可能なオープンソース。完全無料でローカル動作",
  },
  {
    label: "査読済み論文",
    text: "ICML 2024採択。従来の教師あり手法を上回る性能を学術的に実証",
  },
  {
    label: "信頼区間付き出力",
    text: "点推定だけでなく分位点予測（10%/90%）でリスクの幅を可視化",
  },
  {
    label: "季節性・トレンド対応",
    text: "日次・週次・月次の周期パターンを自動検出。温泉旅館の繁閑期を正確に捉える",
  },
  {
    label: "200Mパラメータ",
    text: "軽量モデルでCPUでも動作可能。専用GPUなしで実用的な推論速度を実現",
  },
  {
    label: "外部変数対応",
    text: "TimesFM 2.5のXReg機能で祝日・天気・イベント情報を加味した予測が可能",
  },
  {
    label: "Google Cloud実績",
    text: "Google内部でも需要予測・異常検知・キャパシティプランニングに活用",
  },
];

export function TimesFmTicker() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let animationId: number;
    let position = 0;
    const speed = 0.3; // px/frame — ゆっくり

    function animate() {
      position += speed;
      // コンテンツの半分をスクロールしたらリセット（シームレスループ）
      const halfHeight = el!.scrollHeight / 2;
      if (position >= halfHeight) {
        position = 0;
      }
      el!.style.transform = `translateY(-${position}px)`;
      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

  // 2回繰り返してシームレスループを実現
  const items = [...FACTS, ...FACTS];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* 上下のフェード */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-cream to-transparent z-10" />
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-cream to-transparent z-10" />

      <div ref={scrollRef} className="will-change-transform">
        {items.map((fact, i) => (
          <div
            key={`${fact.label}-${i}`}
            className="px-8 py-4"
          >
            <div className="max-w-xs mx-auto p-4 rounded-xl border border-washi/60 bg-card/40 backdrop-blur-sm">
              <p className="text-xs font-semibold text-copper/70 mb-1">
                {fact.label}
              </p>
              <p className="text-xs text-muted-foreground/60 leading-relaxed">
                {fact.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
