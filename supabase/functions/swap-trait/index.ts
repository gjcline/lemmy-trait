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
  traitType: string;
  newTraitValue: string;
  compositeImageDataUrl: string;
  useNewLogo?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { recipientNFT, traitType, newTraitValue, compositeImageDataUrl, useNewLogo }: SwapTraitRequest = await req.json();

    if (!recipientNFT || !traitType || !newTraitValue || !compositeImageDataUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: recipientNFT, traitType, newTraitValue, compositeImageDataUrl" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("🔄 Starting trait swap...");
    console.log("Recipient NFT:", recipientNFT);
    console.log("Trait:", traitType, "→", newTraitValue);
    console.log("Use New Logo:", useNewLogo);

    // Load environment variables
    const pinataApiKey = Deno.env.get("PINATA_API_KEY");
    const pinataSecret = Deno.env.get("PINATA_SECRET");
    const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
    const updateAuthorityPrivateKey = Deno.env.get("UPDATE_AUTHORITY_PRIVATE_KEY");

    if (!pinataApiKey || !pinataSecret) {
      throw new Error("PINATA_API_KEY or PINATA_SECRET not configured");
    }

    if (!updateAuthorityPrivateKey) {
      throw new Error("UPDATE_AUTHORITY_PRIVATE_KEY not configured");
    }

    const rpcEndpoint = heliusApiKey
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
      : "https://api.mainnet-beta.solana.com";

    console.log("✅ Environment variables loaded");

    // STEP 1: Upload composite image to Pinata
    console.log("📸 Uploading composite image to Pinata...");
    let imageUrl, imageIpfsHash;
    try {
      const base64Data = compositeImageDataUrl.includes(",")
        ? compositeImageDataUrl.split(",")[1]
        : compositeImageDataUrl;

      console.log("📊 Image size:", base64Data.length, "bytes (base64)");
      const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      console.log("📊 Image size:", imageBytes.length, "bytes (raw)");
      const imageBlob = new Blob([imageBytes], { type: "image/jpeg" });

      const imageFormData = new FormData();
      imageFormData.append("file", imageBlob, "trait-swap.jpg");

      console.log("⏱️ Starting Pinata upload...");
      const imageUploadResponse = await fetch(`${PINATA_API_URL}/pinFileToIPFS`, {
        method: "POST",
        headers: {
          "pinata_api_key": pinataApiKey,
          "pinata_secret_api_key": pinataSecret,
        },
        body: imageFormData,
      });

      if (!imageUploadResponse.ok) {
        const errorText = await imageUploadResponse.text();
        throw new Error(`Image upload failed: ${imageUploadResponse.status} - ${errorText}`);
      }

      const imageResult = await imageUploadResponse.json();
      imageIpfsHash = imageResult.IpfsHash;
      imageUrl = `https://ipfs.io/ipfs/${imageIpfsHash}`;

      console.log("✅ Image uploaded:", imageUrl);
    } catch (error) {
      console.error("❌ Image upload step failed:", error);
      throw new Error(`Image upload failed: ${error.message}`);
    }

    // STEP 2: Fetch current NFT metadata from Helius
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

    // STEP 3: Update only the specified trait
    console.log("🔧 Updating trait in metadata...");
    const currentMetadata = asset.content.metadata;
    const currentAttributes = asset.content.metadata.attributes || [];

    // Update the specific trait in attributes array
    const updatedAttributes = currentAttributes.map((attr: any) => {
      // Update the swapped trait
      if (attr.trait_type === traitType) {
        return { ...attr, value: newTraitValue };
      }
      // Update Logo trait if new logo is being used
      if (attr.trait_type === "Logo" && useNewLogo === true) {
        return { ...attr, value: "Uzi" };
      }
      return attr;
    });

    console.log("📋 Updated attributes:", updatedAttributes);

    // STEP 4: Create new metadata with updated trait and image
    const updatedMetadata = {
      name: currentMetadata.name,
      symbol: currentMetadata.symbol || "STARS",
      description: currentMetadata.description || "Trap Stars NFT with custom traits",
      image: imageUrl,
      attributes: updatedAttributes,
      properties: {
        files: [{ uri: imageUrl, type: "image/jpeg" }],
        category: "image",
      },
    };

    console.log("📦 New metadata prepared");

    // STEP 5: Upload new metadata to Pinata
    console.log("📤 Uploading metadata to Pinata...");
    let metadataUrl, metadataIpfsHash;
    try {
      const metadataUploadResponse = await fetch(`${PINATA_API_URL}/pinJSONToIPFS`, {
        method: "POST",
        headers: {
          "pinata_api_key": pinataApiKey,
          "pinata_secret_api_key": pinataSecret,
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
      metadataIpfsHash = metadataResult.IpfsHash;
      metadataUrl = `https://ipfs.io/ipfs/${metadataIpfsHash}`;

      console.log("✅ Metadata uploaded:", metadataUrl);
    } catch (error) {
      console.error("❌ Metadata upload step failed:", error);
      throw new Error(`Metadata upload failed: ${error.message}`);
    }

    // STEP 6: Update NFT on-chain using NEW wallet as authority
    console.log("⛓️ Updating NFT on-chain...");
    let signature;
    try {
      const privateKeyArray = new Uint8Array(JSON.parse(updateAuthorityPrivateKey));
      const web3Keypair = Keypair.fromSecretKey(privateKeyArray);
      const umiKeypair = fromWeb3JsKeypair(web3Keypair);

      const umi = createUmi(rpcEndpoint);
      const newWalletSigner = createSignerFromKeypair(umi, umiKeypair);
      umi.use(signerIdentity(newWalletSigner));

      console.log("🔑 Using NEW authority wallet:", newWalletSigner.publicKey);
      console.log("📝 Updating asset:", recipientNFT);
      console.log("📝 Collection:", COLLECTION_ADDRESS);
      console.log("📝 New URI:", metadataUrl);

      const tx = await updateV1(umi, {
        asset: publicKey(recipientNFT),
        collection: publicKey(COLLECTION_ADDRESS),
        newUri: metadataUrl,
      }).sendAndConfirm(umi);

      signature = tx.signature.toString();

      console.log("✅ NFT updated on-chain:", signature);
    } catch (error) {
      console.error("❌ On-chain update failed:", error);
      throw new Error(`On-chain update failed: ${error.message}`);
    }

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
    console.error("Error stack:", error.stack);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to swap trait",
        details: error.toString(),
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});