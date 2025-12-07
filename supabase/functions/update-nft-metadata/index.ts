import { createUmi } from 'npm:@metaplex-foundation/umi-bundle-defaults@1.4.1';
import { updateV1 } from 'npm:@metaplex-foundation/mpl-core@1.7.0';
import { updateMetadataAccountV2 } from 'npm:@metaplex-foundation/mpl-bubblegum@5.0.2';
import { dasApi } from 'npm:@metaplex-foundation/digital-asset-standard-api@2.0.0';
import { mplBubblegum } from 'npm:@metaplex-foundation/mpl-bubblegum@5.0.2';
import { createSignerFromKeypair, signerIdentity, publicKey as umiPublicKey } from 'npm:@metaplex-foundation/umi@1.4.1';
import { fromWeb3JsKeypair } from 'npm:@metaplex-foundation/umi-web3js-adapters@1.4.1';
import { Keypair, Connection } from 'npm:@solana/web3.js@1.87.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface UpdateNFTRequest {
  assetId: string;
  newMetadataUri: string;
  userWallet: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { assetId, newMetadataUri, userWallet }: UpdateNFTRequest = await req.json();

    if (!assetId || !newMetadataUri || !userWallet) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: assetId, newMetadataUri, userWallet' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Updating NFT:', { assetId, newMetadataUri, userWallet });

    const rpcEndpoint = Deno.env.get('RPC_ENDPOINT') || 'https://api.mainnet-beta.solana.com';
    const collectionAddress = Deno.env.get('COLLECTION_ADDRESS');

    const assetResponse = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-asset',
        method: 'getAsset',
        params: { id: assetId },
      }),
    });

    const assetData = await assetResponse.json();
    const asset = assetData.result;

    if (!asset) {
      throw new Error('Asset not found');
    }

    console.log('Asset type:', asset.interface);

    const OLD_AUTHORITY = '27G5udze5i6DgoyrGZxawDrAkTDw99ZGU27c1LDp7hLk';
    const NEW_AUTHORITY = '2uPRqodizBvVdCzD2sraN1jM8D9x3GvWd5LTrc31Y6aY';

    const detectedAuthority = asset.authorities?.[0]?.address;
    console.log('Detected authority:', detectedAuthority);

    let privateKeyEnv: string;
    let authorityType: string;

    if (detectedAuthority === OLD_AUTHORITY) {
      privateKeyEnv = Deno.env.get('OLD_AUTHORITY_PRIVATE_KEY');
      authorityType = 'old';
      console.log('Using OLD authority wallet');

      if (!privateKeyEnv) {
        throw new Error('OLD_AUTHORITY_PRIVATE_KEY not configured in Supabase Secrets');
      }
    } else if (detectedAuthority === NEW_AUTHORITY) {
      privateKeyEnv = Deno.env.get('UPDATE_AUTHORITY_PRIVATE_KEY');
      authorityType = 'new';
      console.log('Using NEW authority wallet');

      if (!privateKeyEnv) {
        throw new Error('UPDATE_AUTHORITY_PRIVATE_KEY not configured in Supabase Secrets');
      }
    } else {
      throw new Error(`NFT has unknown authority: ${detectedAuthority}. Expected either ${OLD_AUTHORITY} or ${NEW_AUTHORITY}`);
    }

    const privateKeyArray = new Uint8Array(JSON.parse(privateKeyEnv));
    const web3Keypair = Keypair.fromSecretKey(privateKeyArray);
    const umiKeypair = fromWeb3JsKeypair(web3Keypair);

    const umi = createUmi(rpcEndpoint);
    const umiSigner = createSignerFromKeypair(umi, umiKeypair);
    umi.use(signerIdentity(umiSigner));
    umi.use(dasApi());

    const connection = new Connection(rpcEndpoint, 'confirmed');

    let signature: string;

    if (asset.interface === 'V1_NFT' && asset.compression?.compressed) {
      console.log('Updating compressed NFT...');
      umi.use(mplBubblegum());

      const proofResponse = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-asset-proof',
          method: 'getAssetProof',
          params: { id: assetId },
        }),
      });

      const proofData = await proofResponse.json();
      const proof = proofData.result;

      if (!proof) {
        throw new Error('Failed to fetch asset proof');
      }

      const treeAddress = umiPublicKey(proof.tree_id);
      const leafOwner = umiPublicKey(asset.ownership.owner);
      const leafDelegate = asset.ownership.delegate
        ? umiPublicKey(asset.ownership.delegate)
        : leafOwner;

      const tx = await updateMetadataAccountV2(umi, {
        leafOwner,
        leafDelegate,
        merkleTree: treeAddress,
        root: proof.root.map((byte: string) => parseInt(byte)),
        dataHash: asset.compression.data_hash.map((byte: string) => parseInt(byte)),
        creatorHash: asset.compression.creator_hash.map((byte: string) => parseInt(byte)),
        nonce: asset.compression.leaf_id,
        index: asset.compression.leaf_id,
        proof: proof.proof.map((p: string) => umiPublicKey(p)),
        currentMetadata: {
          name: asset.content.metadata.name,
          symbol: asset.content.metadata.symbol,
          uri: asset.content.json_uri,
          sellerFeeBasisPoints: asset.royalty?.basis_points || 0,
          primarySaleHappened: true,
          isMutable: true,
          creators: asset.creators?.map((c: any) => ({
            address: umiPublicKey(c.address),
            verified: c.verified,
            share: c.share,
          })) || [],
          collection: collectionAddress ? { key: umiPublicKey(collectionAddress), verified: false } : null,
          uses: null,
          editionNonce: null,
          tokenStandard: null,
          tokenProgramVersion: null,
        },
        updateArgs: {
          name: asset.content.metadata.name,
          symbol: asset.content.metadata.symbol,
          uri: newMetadataUri,
          sellerFeeBasisPoints: asset.royalty?.basis_points || 0,
          primarySaleHappened: true,
          isMutable: true,
          creators: asset.creators?.map((c: any) => ({
            address: umiPublicKey(c.address),
            verified: c.verified,
            share: c.share,
          })) || [],
          collection: collectionAddress ? { key: umiPublicKey(collectionAddress), verified: false } : null,
          uses: null,
        },
      }).sendAndConfirm(umi);

      signature = tx.signature.toString();
    } else {
      console.log('Updating Core NFT...');

      const assetAddress = umiPublicKey(assetId);
      const updateParams: any = {
        asset: assetAddress,
        newUri: newMetadataUri,
      };

      if (asset.grouping && asset.grouping.length > 0) {
        const collectionInfo = asset.grouping.find((g: any) => g.group_key === 'collection');
        if (collectionInfo) {
          updateParams.collection = umiPublicKey(collectionInfo.group_value);
        }
      }

      const tx = await updateV1(umi, updateParams).sendAndConfirm(umi);
      signature = tx.signature.toString();
    }

    console.log('NFT updated successfully:', signature);
    console.log('Authority used:', authorityType, '(' + (authorityType === 'old' ? OLD_AUTHORITY : NEW_AUTHORITY) + ')');

    return new Response(
      JSON.stringify({
        success: true,
        signature,
        authorityUsed: authorityType,
        authorityAddress: detectedAuthority,
        message: `NFT metadata updated successfully using ${authorityType} authority`
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error updating NFT:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to update NFT metadata',
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});