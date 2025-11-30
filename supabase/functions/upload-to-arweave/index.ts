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
    const { data, type } = await req.json();

    if (!data || !type) {
      throw new Error('Missing required fields: data and type');
    }

    if (!['image', 'metadata'].includes(type)) {
      throw new Error('Invalid type. Must be "image" or "metadata"');
    }

    const apiKey = Deno.env.get('NFT_STORAGE_API_KEY');

    if (!apiKey) {
      throw new Error('NFT_STORAGE_API_KEY environment variable not configured');
    }

    console.log(`📤 Preparing ${type} upload to NFT.Storage...`);
    console.log(`🔑 API Key loaded: ${apiKey.substring(0, 10)}...`);

    let uploadBlob: Blob;
    let filename: string;

    if (type === 'image') {
      console.log('🖼️ Processing image data...');
      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      uploadBlob = new Blob([bytes], { type: 'image/png' });
      filename = 'image.png';
      console.log(`📦 Image blob size: ${uploadBlob.size} bytes`);
    } else if (type === 'metadata') {
      console.log('📋 Processing metadata JSON...');
      const jsonString = JSON.stringify(data);
      uploadBlob = new Blob([jsonString], { type: 'application/json' });
      filename = 'metadata.json';
      console.log(`📦 Metadata blob size: ${uploadBlob.size} bytes`);
    } else {
      throw new Error('Invalid upload type');
    }

    console.log(`⬆️ Uploading ${type} to NFT.Storage via FormData...`);

    const formData = new FormData();
    formData.append('file', uploadBlob, filename);

    const uploadResponse = await fetch('https://api.nft.storage/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    console.log(`📡 NFT.Storage response status: ${uploadResponse.status}`);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('❌ NFT.Storage error response:', errorText);
      throw new Error(`NFT.Storage upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const result = await uploadResponse.json();
    console.log('📦 NFT.Storage response:', JSON.stringify(result, null, 2));

    if (!result.ok || !result.value || !result.value.cid) {
      throw new Error('Invalid response from NFT.Storage: ' + JSON.stringify(result));
    }

    const cid = result.value.cid;
    const url = `https://nftstorage.link/ipfs/${cid}`;

    console.log(`✅ ${type} uploaded successfully to IPFS!`);
    console.log(`📍 CID: ${cid}`);
    console.log(`🔗 Gateway URL: ${url}`);

    return new Response(
      JSON.stringify({
        success: true,
        url,
        cid,
        gateway: url,
        ipfsUri: `ipfs://${cid}`,
        size: uploadBlob.size
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
    console.error('❌ NFT.Storage upload error:', error);
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