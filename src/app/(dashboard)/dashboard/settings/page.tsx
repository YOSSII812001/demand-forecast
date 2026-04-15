"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Facility } from "@/lib/types/database";

const facilitySchema = z.object({
  name: z.string().min(1, "施設名は必須です"),
  location: z.string().optional(),
  total_rooms: z.nan().transform(() => undefined).or(z.number().int().positive("1以上の数を入力")).optional(),
  room_types_json: z.string().optional(),
});

type FacilityForm = z.infer<typeof facilitySchema>;

export default function SettingsPage() {
  const [facility, setFacility] = useState<Facility | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FacilityForm>({
    resolver: zodResolver(facilitySchema),
  });

  useEffect(() => {
    async function loadFacility() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("facilities")
        .select("*")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (data) {
        setFacility(data as Facility);
        reset({
          name: data.name,
          location: data.location ?? "",
          total_rooms: data.total_rooms ?? undefined,
          room_types_json: JSON.stringify(data.room_types ?? [], null, 2),
        });
      }
      setLoading(false);
    }
    loadFacility();
  }, [reset]);

  async function onSubmit(values: FacilityForm) {
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let roomTypes: unknown[] = [];
    if (values.room_types_json) {
      try {
        roomTypes = JSON.parse(values.room_types_json);
      } catch {
        setMessage("客室タイプのJSON形式が正しくありません");
        setSaving(false);
        return;
      }
    }

    const payload = {
      name: values.name,
      location: values.location || null,
      total_rooms: values.total_rooms || null,
      room_types: roomTypes,
      user_id: user.id,
    };

    if (facility) {
      const { error } = await supabase
        .from("facilities")
        .update(payload)
        .eq("id", facility.id);
      if (error) {
        setMessage(`エラー: ${error.message}`);
      } else {
        setMessage("施設情報を更新しました");
      }
    } else {
      const { data, error } = await supabase
        .from("facilities")
        .insert(payload)
        .select()
        .single();
      if (error) {
        setMessage(`エラー: ${error.message}`);
      } else {
        setFacility(data as Facility);
        setMessage("施設情報を登録しました");
      }
    }
    setSaving(false);
  }

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
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="text-muted-foreground">施設情報の登録・編集</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>施設情報</CardTitle>
          <CardDescription>
            施設名、所在地、客室数などの基本情報を設定します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">施設名 *</Label>
              <Input
                id="name"
                placeholder="例: 〇〇ホテル・旅館・店舗"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">所在地</Label>
              <Input
                id="location"
                placeholder="例: 群馬県草津町"
                {...register("location")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="total_rooms">総客室数</Label>
              <Input
                id="total_rooms"
                type="number"
                min={1}
                placeholder="例: 30"
                {...register("total_rooms", { valueAsNumber: true })}
              />
              {errors.total_rooms && (
                <p className="text-sm text-destructive">
                  {errors.total_rooms.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="room_types_json">
                客室タイプ（JSON形式、任意）
              </Label>
              <Textarea
                id="room_types_json"
                rows={4}
                placeholder={`[{"name": "和室", "count": 20, "price": 15000}, {"name": "特別室", "count": 5, "price": 30000}]`}
                {...register("room_types_json")}
              />
            </div>

            {message && (
              <p
                className={`text-sm ${
                  message.startsWith("エラー")
                    ? "text-destructive"
                    : "text-copper"
                }`}
              >
                {message}
              </p>
            )}

            <Button type="submit" disabled={saving}>
              {saving ? "保存中..." : facility ? "更新" : "登録"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
