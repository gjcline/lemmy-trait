// Trap Stars Trait Shop - Blockchain Integration
// Handles Bundlr uploads and Metaplex Bubblegum operations

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
    mplBubblegum,
    transfer,
    burn,
    updateMetadata
} from '@metaplex-foundation/mpl-bubblegum';
import { fromWeb3JsKeypair, fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import Bundlr from '@bundlr-network/client/build/web/bundle';

/**
 * Transfer SOL from user's wallet to a recipient
 */
export async function transferSOL(walletAdapter, recipientAddress, amountSOL, config) {
    console.log(`💸 Transferring ${amountSOL} SOL to ${recipientAddress}...`);

    try {
        const connection = new Connection(config.rpcEndpoint, 'confirmed');

        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: walletAdapter.publicKey,
                toPubkey: new PublicKey(recipientAddress),
                lamports: Math.floor(amountSOL * LAMPORTS_PER_SOL)
            })
        );

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = walletAdapter.publicKey;

        const signedTransaction = await walletAdapter.signTransaction(transaction);

        const signature = await connection.sendRawTransaction(signedTransaction.serialize());

        await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight
        });

        console.log(`✅ Transfer complete: ${signature}`);
        return signature;

    } catch (err) {
        console.error('❌ Transfer error:', err);
        throw new Error(`Failed to transfer SOL: ${err.message}`);
    }
}

/**
 * Get wallet balance in SOL
 */
export async function getWalletBalance(publicKey, config) {
    try {
        const connection = new Connection(config.rpcEndpoint, 'confirmed');
        const balance = await connection.getBalance(new PublicKey(publicKey));
        return balance / LAMPORTS_PER_SOL;
    } catch (err) {
        console.error('❌ Balance check error:', err);
        return 0;
    }
}

/**
 * Upload image to Arweave via Bundlr
 */
export async function uploadImageToBundlr(imageBlob, config) {
    console.log('📤 Uploading image to Arweave via Bundlr...');
    
    try {
        // Convert private key array to Uint8Array
        const privateKeyArray = new Uint8Array(config.updateAuthorityPrivateKey);
        
        // Initialize Bundlr
        const bundlr = new Bundlr(
            'https://node1.bundlr.network',
            'solana',
            privateKeyArray,
            {
                providerUrl: config.rpcEndpoint
            }
        );
        
        console.log('✅ Bundlr initialized');
        
        // Check balance
        const balance = await bundlr.getLoadedBalance();
        const balanceInSOL = balance.toString() / 1e9;
        console.log(`💰 Bundlr balance: ${balanceInSOL} SOL`);

        // Get upload cost
        const imageBuffer = await imageBlob.arrayBuffer();
        const price = await bundlr.getPrice(imageBuffer.byteLength);
        const priceInSOL = price.toString() / 1e9;
        console.log(`💵 Upload cost: ${priceInSOL} SOL`);
        
        // Fund if needed
        if (balance.lt(price)) {
            console.log('⚠️ Insufficient balance, funding Bundlr...');
            const fundAmount = price.multipliedBy(2); // Fund 2x the needed amount
            const fundTx = await bundlr.fund(fundAmount);
            console.log('✅ Funded Bundlr:', fundTx);
        }
        
        // Upload image
        console.log('⬆️ Uploading image...');
        const tags = [
            { name: 'Content-Type', value: 'image/png' },
            { name: 'App-Name', value: 'TrapStarsTraitShop' }
        ];
        
        const tx = await bundlr.upload(imageBuffer, { tags });
        const imageUrl = `https://arweave.net/${tx.id}`;
        
        console.log('✅ Image uploaded:', imageUrl);
        return imageUrl;
        
    } catch (err) {
        console.error('❌ Bundlr upload error:', err);
        throw new Error(`Failed to upload image: ${err.message}`);
    }
}

/**
 * Upload metadata JSON to Arweave via Bundlr
 */
export async function uploadMetadataToBundlr(metadata, config) {
    console.log('📤 Uploading metadata to Arweave via Bundlr...');
    
    try {
        const privateKeyArray = new Uint8Array(config.updateAuthorityPrivateKey);
        
        const bundlr = new Bundlr(
            'https://node1.bundlr.network',
            'solana',
            privateKeyArray,
            {
                providerUrl: config.rpcEndpoint
            }
        );
        
        const metadataString = JSON.stringify(metadata);
        const metadataBuffer = Buffer.from(metadataString);
        
        const tags = [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'App-Name', value: 'TrapStarsTraitShop' }
        ];
        
        const tx = await bundlr.upload(metadataBuffer, { tags });
        const metadataUrl = `https://arweave.net/${tx.id}`;
        
        console.log('✅ Metadata uploaded:', metadataUrl);
        return metadataUrl;
        
    } catch (err) {
        console.error('❌ Metadata upload error:', err);
        throw new Error(`Failed to upload metadata: ${err.message}`);
    }
}

/**
 * Get asset proof from Helius DAS API
 */
export async function getAssetProof(assetId, rpcEndpoint) {
    console.log('🔍 Getting asset proof for:', assetId);
    
    try {
        const response = await fetch(rpcEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'asset-proof',
                method: 'getAssetProof',
                params: {
                    id: assetId
                }
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(`Helius API error: ${data.error.message}`);
        }
        
        console.log('✅ Asset proof retrieved');
        return data.result;
        
    } catch (err) {
        console.error('❌ Get proof error:', err);
        throw new Error(`Failed to get asset proof: ${err.message}`);
    }
}

/**
 * Get asset data from Helius DAS API
 */
export async function getAsset(assetId, rpcEndpoint) {
    console.log('🔍 Getting asset data for:', assetId);
    
    try {
        const response = await fetch(rpcEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'asset-data',
                method: 'getAsset',
                params: {
                    id: assetId
                }
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(`Helius API error: ${data.error.message}`);
        }
        
        console.log('✅ Asset data retrieved');
        return data.result;
        
    } catch (err) {
        console.error('❌ Get asset error:', err);
        throw new Error(`Failed to get asset: ${err.message}`);
    }
}

/**
 * Fetch asset proof from Helius DAS API
 */
async function fetchAssetProof(assetId, config) {
    const response = await fetch(config.rpcEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'asset-proof',
            method: 'getAssetProof',
            params: { id: assetId }
        })
    });

    const { result, error } = await response.json();
    if (error) throw new Error(`Failed to fetch asset proof: ${error.message}`);
    return result;
}

/**
 * Transfer a compressed NFT using Metaplex Bubblegum
 * @param {string} assetId - The NFT asset ID
 * @param {string} recipientAddress - The recipient wallet address
 * @param {Object} walletAdapter - The wallet adapter
 * @param {Object} config - Configuration with RPC endpoint
 * @returns {Promise<string>} - Returns transaction signature
 */
export async function promptNFTSend(assetId, recipientAddress, walletAdapter, config) {
    console.log('📦 Transferring compressed NFT:', assetId);
    console.log('🎯 To address:', recipientAddress);
    console.log('🔑 From wallet:', walletAdapter.publicKey.toString());

    try {
        // Fetch asset proof from Helius DAS API
        console.log('📋 Fetching asset proof...');
        const proof = await fetchAssetProof(assetId, config);
        console.log('✅ Asset proof retrieved');

        // Initialize UMI with wallet adapter
        const umi = createUmi(config.rpcEndpoint)
            .use(mplBubblegum())
            .use(walletAdapterIdentity(walletAdapter));

        // Build transfer instruction
        console.log('🔨 Building transfer instruction...');
        const transferIx = transfer(umi, {
            leafOwner: fromWeb3JsPublicKey(walletAdapter.publicKey),
            newLeafOwner: fromWeb3JsPublicKey(new PublicKey(recipientAddress)),
            merkleTree: fromWeb3JsPublicKey(new PublicKey(proof.tree_id)),
            root: Array.from(Buffer.from(proof.root.trim(), 'base64')),
            dataHash: Array.from(Buffer.from(proof.data_hash.trim(), 'base64')),
            creatorHash: Array.from(Buffer.from(proof.creator_hash.trim(), 'base64')),
            nonce: proof.leaf_id,
            index: proof.leaf_id,
            proof: proof.proof.map(p => ({
                pubkey: fromWeb3JsPublicKey(new PublicKey(p)),
                isWritable: false,
                isSigner: false
            }))
        });

        // Send transaction through Phantom
        console.log('📤 Sending transfer transaction...');
        const signature = await transferIx.sendAndConfirm(umi);

        console.log('✅ NFT transferred! Signature:', signature);
        return signature;

    } catch (err) {
        console.error('❌ NFT transfer error:', err);
        if (err.message && err.message.includes('User rejected')) {
            throw new Error('User cancelled NFT transfer');
        }
        throw new Error(`Failed to transfer NFT: ${err.message || err}`);
    }
}

/**
 * Update compressed NFT metadata
 */
export async function updateCompressedNFT(assetId, newMetadataUri, config) {
    console.log('📝 Updating compressed NFT:', assetId);
    console.log('New metadata URI:', newMetadataUri);
    
    try {
        // Get asset and proof
        const [asset, proof] = await Promise.all([
            getAsset(assetId, config.rpcEndpoint),
            getAssetProof(assetId, config.rpcEndpoint)
        ]);
        
        // Validate asset is compressed
        if (!asset.compression || !asset.compression.compressed) {
            throw new Error('Asset is not a compressed NFT. Only compressed NFTs are supported.');
        }
        
        // Validate update authority
        const updateAuthority = asset.authorities?.find(a => a.scopes?.includes('full'))?.address;
        if (updateAuthority && updateAuthority !== config.updateAuthority) {
            throw new Error('Update authority mismatch. Cannot update this NFT.');
        }
        
        // Initialize UMI
        const umi = createUmi(config.rpcEndpoint)
            .use(mplBubblegum());
        
        // Convert private key to Keypair and set identity
        const privateKeyArray = new Uint8Array(config.updateAuthorityPrivateKey);
        const web3Keypair = Keypair.fromSecretKey(privateKeyArray);
        const umiKeypair = fromWeb3JsKeypair(web3Keypair);
        
        // Set identity using keypair directly
        umi.identity = umiKeypair;
        
        // Prepare update instruction
        const treeAddress = fromWeb3JsPublicKey(new PublicKey(asset.compression.tree));
        
        const updateIx = updateMetadata(umi, {
            merkleTree: treeAddress,
            root: Array.from(Buffer.from(proof.root, 'base64')),
            nonce: asset.compression.leaf_id,
            index: asset.compression.leaf_id,
            currentMetadata: {
                name: asset.content.metadata.name,
                symbol: asset.content.metadata.symbol || '',
                uri: asset.content.json_uri,
                sellerFeeBasisPoints: asset.royalty.basis_points,
                creators: asset.creators?.map(c => ({
                    address: fromWeb3JsPublicKey(new PublicKey(c.address)),
                    verified: c.verified,
                    share: c.share
                })) || [],
                collection: asset.grouping?.find(g => g.group_key === 'collection')
                    ? {
                        key: fromWeb3JsPublicKey(new PublicKey(
                            asset.grouping.find(g => g.group_key === 'collection').group_value
                        )),
                        verified: true
                    }
                    : null,
                uses: null
            },
            updateArgs: {
                name: asset.content.metadata.name,
                symbol: asset.content.metadata.symbol || '',
                uri: newMetadataUri,
                sellerFeeBasisPoints: asset.royalty.basis_points,
                creators: asset.creators?.map(c => ({
                    address: fromWeb3JsPublicKey(new PublicKey(c.address)),
                    verified: c.verified,
                    share: c.share
                })) || [],
                collection: asset.grouping?.find(g => g.group_key === 'collection')
                    ? {
                        key: fromWeb3JsPublicKey(new PublicKey(
                            asset.grouping.find(g => g.group_key === 'collection').group_value
                        )),
                        verified: true
                    }
                    : null,
                uses: null
            },
            proof: proof.proof.map(p => ({
                pubkey: fromWeb3JsPublicKey(new PublicKey(p)),
                isWritable: false,
                isSigner: false
            }))
        });
        
        // Send transaction
        console.log('📤 Sending update transaction...');
        const signature = await updateIx.sendAndConfirm(umi);
        
        console.log('✅ NFT updated! Signature:', signature);
        return signature;
        
    } catch (err) {
        console.error('❌ Update error:', err);
        throw new Error(`Failed to update NFT: ${err.message}`);
    }
}

/**
 * Complete trait swap - orchestrates all operations
 */
export async function executeTraitSwap(sourceNFT, targetNFT, selectedTrait, updatedAttributes, newImageBlob, config, progressCallback) {
    console.log('🚀 Starting complete trait swap...');
    
    try {
        // Step 1: Upload new image
        progressCallback('Uploading new image to Arweave...');
        const imageUrl = await uploadImageToBundlr(newImageBlob, config);
        
        // Step 2: Create and upload new metadata
        progressCallback('Creating and uploading metadata...');
        const newMetadata = {
            name: targetNFT.name,
            symbol: 'TRAP',
            description: `${targetNFT.name} - Trap Stars Collection - Trait Swapped`,
            image: imageUrl,
            attributes: updatedAttributes,
            properties: {
                files: [{
                    uri: imageUrl,
                    type: 'image/png'
                }],
                category: 'image',
                creators: targetNFT.rawData.creators || []
            }
        };
        
        const metadataUrl = await uploadMetadataToBundlr(newMetadata, config);
        
        // Step 3: Burn source NFT
        progressCallback('Burning source NFT...');
        const burnSignature = await burnCompressedNFT(sourceNFT.mint, config);
        
        // Step 4: Update target NFT
        progressCallback('Updating target NFT metadata...');
        const updateSignature = await updateCompressedNFT(targetNFT.mint, metadataUrl, config);
        
        console.log('✅ Trait swap complete!');
        
        return {
            success: true,
            imageUrl,
            metadataUrl,
            burnSignature,
            updateSignature
        };
        
    } catch (err) {
        console.error('❌ Trait swap error:', err);
        throw err;
    }
}