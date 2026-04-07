"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TimesFmTicker } from "@/components/auth/timesfm-ticker";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("メールアドレスまたはパスワードが正しくありません。");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-cream">
      {/* 左: TimesFM信頼性スクロール（デスクトップのみ） */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <TimesFmTicker />
        <div className="absolute bottom-8 left-8 right-8 z-20">
          <p className="text-xs text-muted-foreground/50 text-center">
            Powered by Google TimesFM — Apache 2.0 License
          </p>
        </div>
      </div>

      {/* 右: ログインフォーム */}
      <div className="flex-1 flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">ログイン</CardTitle>
            <CardDescription>
              温泉旅館 需要予測システムにログイン
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@ryokan.jp"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "ログイン中..." : "ログイン"}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              アカウントをお持ちでない方は{" "}
              <Link href="/signup" className="text-copper underline">
                新規登録
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
