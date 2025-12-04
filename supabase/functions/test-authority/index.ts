import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Keypair, Connection, LAMPORTS_PER_SOL } from "npm:@solana/web3.js@1.87.6";

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
    const privateKeyEnv = Deno.env.get('UPDATE_AUTHORITY_PRIVATE_KEY');
    const rpcEndpoint = Deno.env.get('RPC_ENDPOINT') || 'https://api.mainnet-beta.solana.com';
    
    if (!privateKeyEnv) {
      return new Response(
        JSON.stringify({ 
          error: 'UPDATE_AUTHORITY_PRIVATE_KEY not configured in Supabase Secrets',
          configured: false
        }),
        { 
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    console.log('✅ UPDATE_AUTHORITY_PRIVATE_KEY is set');
    console.log('Private key length:', privateKeyEnv.length);

    // Parse and load keypair
    const privateKeyArray = new Uint8Array(JSON.parse(privateKeyEnv));
    console.log('Private key array length:', privateKeyArray.length);
    
    if (privateKeyArray.length !== 64) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid private key length: ${privateKeyArray.length} (expected 64)`,
          configured: true,
          valid: false
        }),
        { 
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const keypair = Keypair.fromSecretKey(privateKeyArray);
    const publicKey = keypair.publicKey.toString();
    const expectedAuthority = '2uPRqodizBvVdCzD2sraN1jM8D9x3GvWd5LTrc31Y6aY';
    const matches = publicKey === expectedAuthority;

    console.log('Derived public key:', publicKey);
    console.log('Expected authority:', expectedAuthority);
    console.log('Match:', matches);

    // Check SOL balance
    let balance = 0;
    let balanceSOL = 0;
    try {
      const connection = new Connection(rpcEndpoint, 'confirmed');
      balance = await connection.getBalance(keypair.publicKey);
      balanceSOL = balance / LAMPORTS_PER_SOL;
      console.log('Authority balance:', balanceSOL, 'SOL');
    } catch (err) {
      console.error('Failed to check balance:', err);
    }

    return new Response(
      JSON.stringify({ 
        configured: true,
        valid: true,
        derivedPublicKey: publicKey,
        expectedAuthority: expectedAuthority,
        match: matches,
        status: matches ? '✅ CORRECT' : '❌ MISMATCH',
        balance: {
          lamports: balance,
          sol: balanceSOL,
          sufficient: balanceSOL >= 0.01,
          warning: balanceSOL < 0.01 ? 'Low balance - need at least 0.01 SOL for updates' : null
        },
        rpcEndpoint: rpcEndpoint,
        timestamp: new Date().toISOString()
      }, null, 2),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      }
    );
  } catch (error: any) {
    console.error('❌ Test error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error',
        stack: error.stack,
        configured: true,
        valid: false
      }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});