import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STORACHA_UPLOAD_URL = 'https://up.storacha.network/upload';

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { data, type } = await req.json();

    if (!data || !type) {
      throw new Error('Missing required fields: data and type');
    }

    if (!['image', 'metadata'].includes(type)) {
      throw new Error('Invalid type. Must be "image" or "metadata"');
    }

    const didKey = Deno.env.get('STORACHA_DID_KEY');

    if (!didKey) {
      throw new Error('STORACHA_DID_KEY not configured in environment');
    }

    console.log(`🔑 Using DID: ${didKey.substring(0, 25)}...`);

    let uploadData: Uint8Array;
    let contentType: string;

    if (type === 'image') {
      console.log('🖼️ Processing image data...');
      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      uploadData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      contentType = 'image/png';
      console.log(`📦 Image size: ${uploadData.length} bytes`);
    } else if (type === 'metadata') {
      console.log('📋 Processing metadata JSON...');
      const jsonString = JSON.stringify(data);
      const encoder = new TextEncoder();
      uploadData = encoder.encode(jsonString);
      contentType = 'application/json';
      console.log(`📦 Metadata size: ${uploadData.length} bytes`);
    } else {
      throw new Error('Invalid upload type');
    }

    console.log(`⬆️ Uploading ${type} to Storacha (${uploadData.length} bytes)...`);

    const uploadResponse = await fetch(STORACHA_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Authorization': `Bearer ${didKey}`,
      },
      body: uploadData,
    });

    console.log(`📡 Storacha response status: ${uploadResponse.status}`);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('❌ Storacha error response:', errorText);
      throw new Error(`Storacha upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const result = await uploadResponse.json();
    console.log('📦 Storacha response:', JSON.stringify(result, null, 2));

    const cid = result.cid || result.root || result;

    if (!cid) {
      throw new Error('No CID in Storacha response: ' + JSON.stringify(result));
    }

    const url = `https://w3s.link/ipfs/${cid}`;

    console.log(`✅ Uploaded ${type} successfully to IPFS!`);
    console.log(`📍 CID: ${cid}`);
    console.log(`🔗 Gateway URL: ${url}`);

    return new Response(
      JSON.stringify({
        success: true,
        url,
        cid,
        ipfsUri: `ipfs://${cid}`,
        gateway: url,
        size: uploadData.length
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ Storacha upload error:', error);
    console.error('Error details:', error.message);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Upload failed'
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      }
    );
  }
});