import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("ADIM 1: İstek geldi! React Native'den veriler alınıyor...");
    const { imageUrl, userId, tempOriginalPath } = await req.json()
    console.log("Alınan veriler - UserID:", userId);

    const replicateToken = Deno.env.get('REPLICATE_API_TOKEN')
    if (!replicateToken) {
      throw new Error("Replicate şifresi (Token) Supabase kasasında bulunamadı!");
    }
    console.log("ADIM 2: Replicate şifresi kasadan başarıyla alındı.");

    console.log("ADIM 3: Replicate API'sine iş emri ve fotoğraf gönderiliyor...");
    const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        input: {
          image: imageUrl,
          prompt: "3d disney pixar style character of this person, highly detailed, stylized, masterpiece, 8k resolution, energetic sports vibe",
          prompt_strength: 0.75
        }
      })
    })

    // YENİ EKLEDİĞİMİZ GÜVENLİK KONTROLÜ
    if (!replicateResponse.ok) {
      const errorText = await replicateResponse.text();
      console.error("REPLICATE BİZİ REDDETTİ:", errorText);
      throw new Error(`Replicate İzin Vermedi: ${errorText}`);
    }

    let prediction = await replicateResponse.json()
    console.log("ADIM 4: Replicate işi kabul etti! Durum:", prediction.status);

    console.log("ADIM 5: Yapay Zekanın resmi çizmesi bekleniyor (Bu biraz sürebilir)...");
    let attempts = 0;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
      attempts++;
      console.log(`Bekleniyor... Deneme: ${attempts} | Durum: ${prediction.status}`);
      await new Promise(resolve => setTimeout(resolve, 2000))
      const statusResponse = await fetch(prediction.urls.get, {
        headers: { 'Authorization': `Token ${replicateToken}` }
      })
      prediction = await statusResponse.json()
    }

    if (prediction.status === 'failed') throw new Error('Replicate modeli resmi çizerken başarısız oldu.')

    console.log("ADIM 6: Resim başarıyla çizildi! Link alınıyor...");
    const toonImageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output

    console.log("ADIM 7: Supabase sunucusuna bağlanılıyor...");
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log("ADIM 8: Yeni resim indiriliyor ve kilitli kovaya yükleniyor...");
    const imageResponse = await fetch(toonImageUrl)
    const imageBuffer = await imageResponse.arrayBuffer()

    const finalPath = `${userId}/toon_avatar_${Date.now()}.jpg`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('user_avatars')
      .upload(finalPath, imageBuffer, { contentType: 'image/jpeg' })

    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseAdmin.storage.from('user_avatars').getPublicUrl(finalPath)

    console.log("ADIM 9: Yükleme başarılı! Orijinal gerçek fotoğraf kalıcı olarak siliniyor...");
    await supabaseAdmin.storage
      .from('user_avatars')
      .remove([tempOriginalPath])

    console.log("ADIM 10: İŞLEM TAMAM! Yeni link telefona gönderiliyor.");
    return new Response(
      JSON.stringify({ toonUrl: publicData.publicUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("KRİTİK HATA YAKALANDI:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})