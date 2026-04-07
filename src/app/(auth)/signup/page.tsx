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

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-cream relative overflow-hidden">
      {/* 背景: TimesFM信頼性スクロール（常時表示） */}
      <div className="absolute inset-0 lg:relative lg:w-1/2 lg:flex">
        <TimesFmTicker />
        <div className="absolute bottom-8 left-8 right-8 z-20 hidden lg:block">
          <p className="text-xs text-muted-foreground/50 text-center">
            Powered by Google TimesFM — Apache 2.0 License
          </p>
        </div>
      </div>

      {/* サインアップフォーム（モバイル: 背景上に重ねて表示） */}
      <div className="flex-1 flex items-center justify-center px-4 relative z-30">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">新規登録</CardTitle>
            <CardDescription>
              アカウントを作成して需要予測を始めましょう
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">お名前</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="山田 太郎"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
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
                  placeholder="8文字以上"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "登録中..." : "アカウント作成"}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              すでにアカウントをお持ちの方は{" "}
              <Link href="/login" className="text-copper underline">
                ログイン
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
