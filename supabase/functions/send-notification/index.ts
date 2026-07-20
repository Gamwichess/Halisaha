import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { team_id, title, body } = await req.json();

    if (!team_id || !title) {
      throw new Error("team_id ve title zorunludur");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Takımdaki tüm üyeleri çek
    const { data: members, error: membersError } = await supabaseAdmin
      .from("team_members")
      .select("user_id")
      .eq("team_id", team_id);

    if (membersError) throw membersError;
    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ sent: 0, total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds: string[] = members.map((m: any) => m.user_id);

    // Push token'larını çek (push_token sütunu profiles tablosunda olmalı)
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, push_token")
      .in("id", userIds)
      .not("push_token", "is", null);

    if (profilesError) throw profilesError;

    const validProfiles = (profiles ?? []).filter(
      (p: any) => p.push_token && p.push_token.startsWith("ExponentPushToken")
    );

    // Expo Push API'ye toplu gönder
    let sentCount = 0;
    if (validProfiles.length > 0) {
      const messages = validProfiles.map((p: any) => ({
        to: p.push_token,
        sound: "default",
        title,
        body: body ?? "",
      }));

      const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });

      if (!expoResponse.ok) {
        const errText = await expoResponse.text();
        console.error("Expo Push hatası:", errText);
      } else {
        sentCount = validProfiles.length;
      }
    }

    // notifications tablosuna her üye için kayıt ekle
    const notifRows = userIds.map((uid: string) => ({
      team_id,
      user_id: uid,
      type: "push",
      title,
      body: body ?? "",
      is_read: false,
    }));

    const { error: notifError } = await supabaseAdmin
      .from("notifications")
      .insert(notifRows);

    if (notifError) {
      console.error("notifications insert hatası:", notifError.message);
    }

    return new Response(
      JSON.stringify({ sent: sentCount, total: userIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("send-notification hatası:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
