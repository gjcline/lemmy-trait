import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PINATA_API_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { data } = await req.json();

    if (!data) {
      throw new Error('Missing metadata');
    }

    const jwt = Deno.env.get('PINATA_JWT');

    if (!jwt) {
      throw new Error('PINATA_JWT not configured in environment');
    }

    console.log('📋 Processing metadata JSON...');
    console.log('📦 Metadata:', JSON.stringify(data, null, 2));

    console.log('⬆️ Uploading metadata to Pinata...');

    const uploadResponse = await fetch(PINATA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pinataContent: data,
        pinataMetadata: {
          name: 'TrapStars NFT Metadata'
        }
      }),
    });

    console.log(`📡 Pinata response status: ${uploadResponse.status}`);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('❌ Pinata error:', errorText);
      throw new Error(`Pinata upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const result = await uploadResponse.json();
    console.log('📦 Pinata response:', JSON.stringify(result, null, 2));

    const ipfsHash = result.IpfsHash;

    if (!ipfsHash) {
      throw new Error('No IPFS hash in Pinata response');
    }

    const url = `https://ipfs.io/ipfs/${ipfsHash}`;

    console.log('✅ Metadata uploaded to IPFS!');
    console.log(`📍 IPFS Hash: ${ipfsHash}`);
    console.log(`🔗 Public Gateway URL: ${url}`);

    return new Response(
      JSON.stringify({
        success: true,
        url,
        ipfsHash,
        ipfsUri: `ipfs://${ipfsHash}`,
        gateway: url
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
    console.error('❌ Upload error:', error);

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
