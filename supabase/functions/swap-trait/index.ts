import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createUmi } from "npm:@metaplex-foundation/umi-bundle-defaults@1.4.1";
import { updateV1 } from "npm:@metaplex-foundation/mpl-core@1.7.0";
import { createSignerFromKeypair, signerIdentity, publicKey } from "npm:@metaplex-foundation/umi@1.4.1";
import { fromWeb3JsKeypair } from "npm:@metaplex-foundation/umi-web3js-adapters@1.4.1";
import { Keypair } from "npm:@solana/web3.js@1.87.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PINATA_API_URL = "https://api.pinata.cloud/pinning";
const COLLECTION_ADDRESS = "5NR4dajELRkLdAPj9ebmW8YrowY61ZX75ugRAvYj7C8i";

interface SwapTraitRequest {
  recipientNFT: string;
  donorNFT: string;
  traitType: string;
  newTraitValue: string;
  compositeImageDataUrl: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { recipientNFT, donorNFT, traitType, newTraitValue, compositeImageDataUrl }: SwapTraitRequest = await req.json();

    if (!recipientNFT || !donorNFT || !traitType || !newTraitValue || !compositeImageDataUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("🔄 Starting trait swap...");
    console.log("Recipient NFT:", recipientNFT);
    console.log("Donor NFT:", donorNFT);
    console.log("Trait:", traitType, "->", newTraitValue);

    const pinataJwt = Deno.env.get("PINATA_JWT");
    const rpcEndpoint = Deno.env.get("RPC_ENDPOINT") || "https://api.mainnet-beta.solana.com";
    const newAuthorityPrivateKey = Deno.env.get("NEW_AUTHORITY_PRIVATE_KEY");

    if (!pinataJwt) {
      throw new Error("PINATA_JWT not configured");
    }

    if (!newAuthorityPrivateKey) {
      throw new Error("NEW_AUTHORITY_PRIVATE_KEY not configured");
    }

    console.log("✅ Environment variables loaded");

    // Step 1: Upload composite image to Pinata
    console.log("📸 Uploading composite image to Pinata...");
    const base64Data = compositeImageDataUrl.includes(",") ? compositeImageDataUrl.split(",")[1] : compositeImageDataUrl;
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const imageBlob = new Blob([imageBytes], { type: "image/png" });

    const imageFormData = new FormData();
    imageFormData.append("file", imageBlob, "trait-swap.png");

    const imageUploadResponse = await fetch(`${PINATA_API_URL}/pinFileToIPFS`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pinataJwt}`,
      },
      body: imageFormData,
    });

    if (!imageUploadResponse.ok) {
      const errorText = await imageUploadResponse.text();
      throw new Error(`Image upload failed: ${imageUploadResponse.status} - ${errorText}`);
    }

    const imageResult = await imageUploadResponse.json();
    const imageIpfsHash = imageResult.IpfsHash;
    const imageUrl = `https://ipfs.io/ipfs/${imageIpfsHash}`;

    console.log("✅ Image uploaded:", imageUrl);

    // Step 2: Fetch current NFT metadata from Helius
    console.log("📥 Fetching current metadata from Helius...");
    const assetResponse = await fetch(rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "get-asset",
        method: "getAsset",
        params: { id: recipientNFT },
      }),
    });

    const assetData = await assetResponse.json();
    const asset = assetData.result;

    if (!asset) {
      throw new Error("Recipient NFT not found");
    }

    console.log("✅ Current metadata fetched");

    // Step 3: Update only the specified trait
    console.log("🔧 Updating trait in metadata...");
    const currentMetadata = asset.content.metadata;
    const currentAttributes = asset.content.metadata.attributes || [];

    const updatedAttributes = currentAttributes.map((attr: any) => {
      if (attr.trait_type === traitType) {
        return { ...attr, value: newTraitValue };
      }
      return attr;
    });

    console.log("📋 Updated attributes:", updatedAttributes);

    // Step 4: Create new metadata with updated trait and image
    const updatedMetadata = {
      name: currentMetadata.name,
      symbol: currentMetadata.symbol || "TRAP",
      description: currentMetadata.description || "Trap Stars NFT with custom traits",
      image: imageUrl,
      attributes: updatedAttributes,
      properties: {
        files: [{ uri: imageUrl, type: "image/png" }],
        category: "image",
      },
    };

    console.log("📦 New metadata prepared");

    // Step 5: Upload new metadata to Pinata
    console.log("📤 Uploading metadata to Pinata...");
    const metadataUploadResponse = await fetch(`${PINATA_API_URL}/pinJSONToIPFS`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pinataJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pinataContent: updatedMetadata,
        pinataMetadata: {
          name: "TrapStars Trait Swap Metadata",
        },
      }),
    });

    if (!metadataUploadResponse.ok) {
      const errorText = await metadataUploadResponse.text();
      throw new Error(`Metadata upload failed: ${metadataUploadResponse.status} - ${errorText}`);
    }

    const metadataResult = await metadataUploadResponse.json();
    const metadataIpfsHash = metadataResult.IpfsHash;
    const metadataUrl = `https://ipfs.io/ipfs/${metadataIpfsHash}`;

    console.log("✅ Metadata uploaded:", metadataUrl);

    // Step 6: Update NFT on-chain using NEW wallet as authority
    console.log("⛓️ Updating NFT on-chain...");
    const privateKeyArray = new Uint8Array(JSON.parse(newAuthorityPrivateKey));
    const web3Keypair = Keypair.fromSecretKey(privateKeyArray);
    const umiKeypair = fromWeb3JsKeypair(web3Keypair);

    const umi = createUmi(rpcEndpoint);
    const newWalletSigner = createSignerFromKeypair(umi, umiKeypair);
    umi.use(signerIdentity(newWalletSigner));

    console.log("🔑 Using NEW authority wallet:", newWalletSigner.publicKey);

    const tx = await updateV1(umi, {
      asset: publicKey(recipientNFT),
      collection: publicKey(COLLECTION_ADDRESS),
      newUri: metadataUrl,
    }).sendAndConfirm(umi);

    const signature = tx.signature.toString();

    console.log("✅ NFT updated on-chain:", signature);

    return new Response(
      JSON.stringify({
        success: true,
        signature,
        imageUrl,
        metadataUrl,
        imageIpfsHash,
        metadataIpfsHash,
        updatedTrait: { traitType, newTraitValue },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Trait swap failed:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to swap trait",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
