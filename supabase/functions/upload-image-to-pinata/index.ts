import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const pinataJwt = Deno.env.get('PINATA_JWT');
    if (!pinataJwt) {
      throw new Error('PINATA_JWT environment variable not configured');
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: 'No file provided or invalid file' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('📤 Uploading file to Pinata:', file.name, file.size, 'bytes');

    const pinataFormData = new FormData();
    pinataFormData.append('file', file);

    const pinataResponse = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pinataJwt}`,
      },
      body: pinataFormData,
    });

    if (!pinataResponse.ok) {
      const errorText = await pinataResponse.text();
      console.error('❌ Pinata API error:', pinataResponse.status, errorText);
      throw new Error(`Pinata API error: ${pinataResponse.status} ${errorText}`);
    }

    const result = await pinataResponse.json();
    const imageUrl = `https://gateway.pinata.cloud/ipfs/${result.data.cid}`;

    console.log('✅ Image uploaded to IPFS:', imageUrl);
    console.log('📌 IPFS CID:', result.data.cid);

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl,
        cid: result.data.cid,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error('❌ Upload error:', err);
    return new Response(
      JSON.stringify({
        error: err.message || 'Failed to upload image',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});