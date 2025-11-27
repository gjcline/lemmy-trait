// Trap Stars Trait Shop - Blockchain Integration
// Handles Pinata IPFS uploads and Metaplex Bubblegum operations

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
    mplBubblegum,
    transfer,
    burn,
    updateMetadata
} from '@metaplex-foundation/mpl-bubblegum';
import {
    transferV1,
    updateV1
} from '@metaplex-foundation/mpl-core';
import { fromWeb3JsKeypair, fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { publicKey as umiPublicKey } from '@metaplex-foundation/umi';

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
 * Upload image to IPFS via Pinata
 */
export async function uploadImageToPinata(imageBlob, config) {
    console.log('📤 Uploading image to IPFS via Pinata...');

    try {
        const formData = new FormData();
        const file = new File([imageBlob], 'nft-image.png', { type: 'image/png' });
        formData.append('file', file);

        console.log('⬆️ Uploading to Pinata v3...');
        const response = await fetch('https://uploads.pinata.cloud/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.pinataJwt}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Pinata API error response:', errorText);
            throw new Error(`Pinata API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        const imageUrl = `https://gateway.pinata.cloud/ipfs/${result.data.cid}`;

        console.log('✅ Image uploaded to IPFS:', imageUrl);
        console.log('📌 IPFS CID:', result.data.cid);
        return imageUrl;

    } catch (err) {
        console.error('❌ Pinata upload error:', err);
        throw new Error(`Failed to upload image: ${err.message}`);
    }
}

/**
 * Upload metadata JSON to IPFS via Pinata
 */
export async function uploadMetadataToPinata(metadata, config) {
    console.log('📤 Uploading metadata to IPFS via Pinata...');

    try {
        const formData = new FormData();
        const json = JSON.stringify(metadata);
        const blob = new Blob([json], { type: 'application/json' });
        const file = new File([blob], 'metadata.json', { type: 'application/json' });

        formData.append('file', file);

        console.log('⬆️ Uploading metadata to Pinata v3...');
        const response = await fetch('https://uploads.pinata.cloud/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.pinataJwt}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Pinata API error response:', errorText);
            throw new Error(`Pinata API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        const metadataUrl = `https://gateway.pinata.cloud/ipfs/${result.data.cid}`;

        console.log('✅ Metadata uploaded to IPFS:', metadataUrl);
        console.log('📌 IPFS CID:', result.data.cid);
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
 * Detect NFT type from asset data
 */
export function detectNFTType(asset) {
    console.log('🔍 Analyzing asset for type detection:', {
        interface: asset.interface,
        ownershipOwner: asset.ownership?.owner,
        hasCompression: !!asset.compression,
        compressed: asset.compression?.compressed
    });

    if (asset.interface === 'V1_NFT' ||
        asset.interface === 'MplCoreAsset' ||
        (asset.ownership && asset.ownership.owner === 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d')) {
        console.log('🎯 Detected: Metaplex Core NFT');
        return 'core';
    }

    if (asset.compression && asset.compression.compressed) {
        console.log('🎯 Detected: Compressed NFT');
        return 'compressed';
    }

    console.log('🎯 Detected: Standard NFT');
    console.warn('⚠️ Asset data:', JSON.stringify(asset, null, 2));
    return 'standard';
}

/**
 * Transfer a Metaplex Core NFT
 */
async function transferCoreNFT(assetId, recipientAddress, walletAdapter, config) {
    console.log('🎯 Transferring Core NFT:', assetId);

    try {
        const asset = await getAsset(assetId, config.rpcEndpoint);
        console.log('Asset data for transfer:', asset);

        const umi = createUmi(config.rpcEndpoint)
            .use(walletAdapterIdentity(walletAdapter));

        const assetAddress = umiPublicKey(assetId);
        const newOwner = umiPublicKey(recipientAddress);

        const transferParams = {
            asset: assetAddress,
            newOwner: newOwner
        };

        if (asset.grouping && asset.grouping.length > 0) {
            const collectionInfo = asset.grouping.find(g => g.group_key === 'collection');
            if (collectionInfo) {
                console.log('Adding collection to transfer:', collectionInfo.group_value);
                transferParams.collection = umiPublicKey(collectionInfo.group_value);
            }
        }

        console.log('Transfer params:', transferParams);

        const tx = await transferV1(umi, transferParams).sendAndConfirm(umi);

        console.log('✅ Core NFT transferred! Signature:', tx.signature);
        return tx.signature;

    } catch (err) {
        console.error('❌ Core NFT transfer error:', err);
        if (err.message && err.message.includes('User rejected')) {
            throw new Error('User cancelled NFT transfer');
        }
        throw new Error(`Failed to transfer Core NFT: ${err.message || err}`);
    }
}

/**
 * Update a Metaplex Core NFT metadata
 */
async function updateCoreNFT(assetId, newMetadataUri, config) {
    console.log('📝 Updating Core NFT:', assetId);
    console.log('New metadata URI:', newMetadataUri);

    try {
        const asset = await getAsset(assetId, config.rpcEndpoint);
        console.log('Asset data for update:', asset);

        const umi = createUmi(config.rpcEndpoint);

        const privateKeyArray = new Uint8Array(config.updateAuthorityPrivateKey);
        const web3Keypair = Keypair.fromSecretKey(privateKeyArray);
        const umiKeypair = fromWeb3JsKeypair(web3Keypair);

        umi.identity = umiKeypair;

        const assetAddress = umiPublicKey(assetId);

        const updateParams = {
            asset: assetAddress,
            newUri: newMetadataUri
        };

        if (asset.grouping && asset.grouping.length > 0) {
            const collectionInfo = asset.grouping.find(g => g.group_key === 'collection');
            if (collectionInfo) {
                console.log('Adding collection to update:', collectionInfo.group_value);
                updateParams.collection = umiPublicKey(collectionInfo.group_value);
            }
        }

        console.log('Update params:', updateParams);

        const tx = await updateV1(umi, updateParams).sendAndConfirm(umi);

        console.log('✅ Core NFT updated! Signature:', tx.signature);
        return tx.signature;

    } catch (err) {
        console.error('❌ Core NFT update error:', err);
        throw new Error(`Failed to update Core NFT: ${err.message || err}`);
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
 * Transfer an NFT (auto-detects type: Core, Compressed, or Standard)
 * @param {string} assetId - The NFT asset ID
 * @param {string} recipientAddress - The recipient wallet address
 * @param {Object} walletAdapter - The wallet adapter
 * @param {Object} config - Configuration with RPC endpoint
 * @returns {Promise<string>} - Returns transaction signature
 */
export async function promptNFTSend(assetId, recipientAddress, walletAdapter, config) {
    console.log('📦 Transferring NFT:', assetId);
    console.log('🎯 To address:', recipientAddress);
    console.log('🔑 From wallet:', walletAdapter.publicKey.toString());

    try {
        const asset = await getAsset(assetId, config.rpcEndpoint);
        const nftType = detectNFTType(asset);

        if (nftType === 'core') {
            return await transferCoreNFT(assetId, recipientAddress, walletAdapter, config);
        }

        if (nftType === 'compressed') {
            console.log('📋 Fetching asset proof...');
            const proof = await fetchAssetProof(assetId, config);
            console.log('✅ Asset proof retrieved');

            const umi = createUmi(config.rpcEndpoint)
                .use(mplBubblegum())
                .use(walletAdapterIdentity(walletAdapter));

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

            console.log('📤 Sending transfer transaction...');
            const signature = await transferIx.sendAndConfirm(umi);

            console.log('✅ NFT transferred! Signature:', signature);
            return signature;
        }

        throw new Error('Standard NFT transfers not yet implemented');

    } catch (err) {
        console.error('❌ NFT transfer error:', err);
        if (err.message && err.message.includes('User rejected')) {
            throw new Error('User cancelled NFT transfer');
        }
        throw new Error(`Failed to transfer NFT: ${err.message || err}`);
    }
}

/**
 * Update NFT metadata (auto-detects type: Core, Compressed, or Standard)
 */
export async function updateCompressedNFT(assetId, newMetadataUri, config) {
    console.log('📝 Updating NFT:', assetId);
    console.log('New metadata URI:', newMetadataUri);

    try {
        const asset = await getAsset(assetId, config.rpcEndpoint);
        const nftType = detectNFTType(asset);

        if (nftType === 'core') {
            return await updateCoreNFT(assetId, newMetadataUri, config);
        }

        if (nftType === 'compressed') {
            const proof = await getAssetProof(assetId, config.rpcEndpoint);

            const updateAuthority = asset.authorities?.find(a => a.scopes?.includes('full'))?.address;
            if (updateAuthority && updateAuthority !== config.updateAuthority) {
                throw new Error('Update authority mismatch. Cannot update this NFT.');
            }

            const umi = createUmi(config.rpcEndpoint)
                .use(mplBubblegum());

            const privateKeyArray = new Uint8Array(config.updateAuthorityPrivateKey);
            const web3Keypair = Keypair.fromSecretKey(privateKeyArray);
            const umiKeypair = fromWeb3JsKeypair(web3Keypair);

            umi.identity = umiKeypair;

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

            console.log('📤 Sending update transaction...');
            const signature = await updateIx.sendAndConfirm(umi);

            console.log('✅ NFT updated! Signature:', signature);
            return signature;
        }

        throw new Error('Standard NFT updates not yet implemented');
        
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