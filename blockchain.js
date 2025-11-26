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
        console.log(`💰 Bundlr balance: ${bundlr.utils.fromAtomic(balance)} SOL`);
        
        // Get upload cost
        const imageBuffer = await imageBlob.arrayBuffer();
        const price = await bundlr.getPrice(imageBuffer.byteLength);
        console.log(`💵 Upload cost: ${bundlr.utils.fromAtomic(price)} SOL`);
        
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
 * Burn compressed NFT
 */
export async function burnCompressedNFT(assetId, config) {
    console.log('🔥 Burning compressed NFT:', assetId);
    
    try {
        // Get asset and proof
        const [asset, proof] = await Promise.all([
            getAsset(assetId, config.rpcEndpoint),
            getAssetProof(assetId, config.rpcEndpoint)
        ]);
        
        console.log('Asset:', asset);
        console.log('Proof:', proof);
        
        // Validate asset is compressed
        if (!asset.compression || !asset.compression.compressed) {
            throw new Error('Asset is not a compressed NFT. Only compressed NFTs are supported.');
        }
        
        // Validate ownership - owner or update authority can burn
        const canBurn = asset.ownership.owner === config.updateAuthority || 
                       asset.authorities?.some(a => a.address === config.updateAuthority && a.scopes?.includes('full'));
        if (!canBurn) {
            console.warn('⚠️ Warning: Update authority may not match owner. Proceeding with burn attempt...');
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
        
        // Prepare burn instruction
        const treeAddress = fromWeb3JsPublicKey(new PublicKey(asset.compression.tree));
        const leafOwner = fromWeb3JsPublicKey(new PublicKey(asset.ownership.owner));
        const leafDelegate = asset.ownership.delegate 
            ? fromWeb3JsPublicKey(new PublicKey(asset.ownership.delegate))
            : leafOwner;
        
        const burnIx = burn(umi, {
            leafOwner,
            leafDelegate,
            merkleTree: treeAddress,
            root: Array.from(Buffer.from(proof.root, 'base64')),
            dataHash: Array.from(Buffer.from(asset.compression.data_hash, 'base64')),
            creatorHash: Array.from(Buffer.from(asset.compression.creator_hash, 'base64')),
            nonce: asset.compression.leaf_id,
            index: asset.compression.leaf_id,
            proof: proof.proof.map(p => ({
                pubkey: fromWeb3JsPublicKey(new PublicKey(p)),
                isWritable: false,
                isSigner: false
            }))
        });
        
        // Send transaction
        console.log('📤 Sending burn transaction...');
        const signature = await burnIx.sendAndConfirm(umi);
        
        console.log('✅ NFT burned! Signature:', signature);
        return signature;
        
    } catch (err) {
        console.error('❌ Burn error:', err);
        throw new Error(`Failed to burn NFT: ${err.message}`);
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