import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Irys from "npm:@irys/sdk@0.2.10";

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

    const updateAuthorityKey = Deno.env.get('UPDATE_AUTHORITY_PRIVATE_KEY');

    if (!updateAuthorityKey) {
      throw new Error('UPDATE_AUTHORITY_PRIVATE_KEY environment variable not configured');
    }

    console.log(`📤 Initializing Irys client for ${type} upload...`);

    const keyArray = JSON.parse(updateAuthorityKey);

    const irys = new Irys({
      url: "https://node2.irys.xyz",
      token: "solana",
      key: keyArray,
    });

    console.log(`💰 Irys wallet address: ${irys.address}`);

    let uploadData: string | Uint8Array;
    let contentType: string;
    const tags = [
      { name: "App-Name", value: "TrapStars" },
      { name: "App-Version", value: "1.0" }
    ];

    if (type === 'image') {
      console.log('🖼️ Processing image data...');
      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      uploadData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      contentType = 'image/png';
      console.log(`📦 Image size: ${uploadData.length} bytes`);
    } else if (type === 'metadata') {
      console.log('📋 Processing metadata JSON...');
      uploadData = JSON.stringify(data);
      contentType = 'application/json';
      console.log(`📦 Metadata size: ${uploadData.length} bytes`);
    } else {
      throw new Error('Invalid upload type');
    }

    tags.push({ name: "Content-Type", value: contentType });

    console.log(`⬆️ Uploading ${type} to Arweave via Irys...`);
    const receipt = await irys.upload(uploadData, { tags });

    const url = `https://gateway.irys.xyz/${receipt.id}`;

    console.log(`✅ ${type} uploaded successfully!`);
    console.log(`📌 Transaction ID: ${receipt.id}`);
    console.log(`🔗 URL: ${url}`);
    console.log(`⏰ Timestamp: ${receipt.timestamp}`);

    return new Response(
      JSON.stringify({
        success: true,
        url,
        id: receipt.id,
        timestamp: receipt.timestamp
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
    console.error('❌ Arweave upload error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);

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