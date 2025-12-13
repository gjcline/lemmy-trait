// Trap Stars Trait Shop - Blockchain Module
// Handles all blockchain transactions: SOL transfers, NFT transfers, metadata updates

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { transferV1 } from '@metaplex-foundation/mpl-core';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { publicKey as umiPublicKey } from '@metaplex-foundation/umi';

/**
 * Get RPC endpoint from environment
 */
function getRpcEndpoint() {
    const heliusKey = import.meta.env.VITE_HELIUS_API_KEY;
    if (heliusKey) {
        return `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
    }
    return 'https://api.mainnet-beta.solana.com';
}

/**
 * Transfer SOL from user's wallet to a recipient
 * @param {Object} walletAdapter - Phantom wallet adapter
 * @param {string} recipientAddress - Recipient wallet address
 * @param {number} amountSOL - Amount in SOL to transfer
 * @returns {Promise<string>} Transaction signature
 */
export async function transferSOL(walletAdapter, recipientAddress, amountSOL) {
    console.log(`💸 Transferring ${amountSOL} SOL to ${recipientAddress}...`);

    try {
        const connection = new Connection(getRpcEndpoint(), 'confirmed');

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

        console.log('📝 Requesting wallet signature...');
        const signedTransaction = await walletAdapter.signTransaction(transaction);

        console.log('📤 Sending transaction...');
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());

        console.log('⏳ Confirming transaction...');
        await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight
        }, 'confirmed');

        console.log(`✅ SOL transfer complete: ${signature}`);
        return signature;

    } catch (error) {
        console.error('❌ SOL transfer failed:', error);
        throw new Error(`Failed to transfer SOL: ${error.message}`);
    }
}

/**
 * Transfer an NFT from user's wallet to a recipient using Metaplex Core
 * @param {Object} walletAdapter - Phantom wallet adapter
 * @param {string} nftMint - NFT mint address
 * @param {string} recipientAddress - Recipient wallet address
 * @param {string} collectionAddress - Collection address for verification
 * @returns {Promise<string>} Transaction signature
 */
export async function transferNFT(walletAdapter, nftMint, recipientAddress, collectionAddress) {
    console.log(`🎨 Transferring NFT ${nftMint} to ${recipientAddress}...`);

    try {
        const umi = createUmi(getRpcEndpoint());
        umi.use(walletAdapterIdentity(walletAdapter));

        console.log('📝 Creating transfer transaction...');
        const tx = await transferV1(umi, {
            asset: umiPublicKey(nftMint),
            collection: umiPublicKey(collectionAddress),
            newOwner: umiPublicKey(recipientAddress)
        }).sendAndConfirm(umi);

        const signature = tx.signature.toString();
        console.log(`✅ NFT transfer complete: ${signature}`);
        return signature;

    } catch (error) {
        console.error('❌ NFT transfer failed:', error);
        throw new Error(`Failed to transfer NFT: ${error.message}`);
    }
}

/**
 * Update NFT metadata by calling the Supabase edge function
 * @param {string} recipientNFT - Recipient NFT mint address
 * @param {string} traitType - Trait category (e.g., "body", "shirt")
 * @param {string} newTraitValue - New trait value (e.g., "Ghost", "Hoodie")
 * @param {string} compositeImageDataUrl - Base64 data URL of the composite image
 * @param {boolean} useNewLogo - Whether to update the Logo trait to "Uzi"
 * @returns {Promise<Object>} { signature, imageUrl, metadataUrl }
 */
export async function updateNFTMetadata(recipientNFT, traitType, newTraitValue, compositeImageDataUrl, useNewLogo = false) {
    console.log(`🔄 Updating NFT metadata for ${recipientNFT}...`);
    console.log(`   Trait: ${traitType} → ${newTraitValue}`);
    console.log(`   New Logo: ${useNewLogo}`);

    try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Supabase configuration missing');
        }

        const functionUrl = `${supabaseUrl}/functions/v1/swap-trait`;

        console.log('📤 Calling edge function...');
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'apikey': supabaseAnonKey
            },
            body: JSON.stringify({
                recipientNFT,
                traitType,
                newTraitValue,
                compositeImageDataUrl,
                useNewLogo
            })
        });

        if (!response.ok) {
            let errorMessage = `Edge function failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.details || errorMessage;
                console.error('❌ Edge function error details:', errorData);
            } catch (parseError) {
                const errorText = await response.text();
                console.error('❌ Edge function error (non-JSON):', errorText);
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();
        console.log('✅ Metadata update complete');
        console.log(`   Image: ${result.imageUrl}`);
        console.log(`   Metadata: ${result.metadataUrl}`);
        console.log(`   Signature: ${result.signature}`);

        return result;

    } catch (error) {
        console.error('❌ Metadata update failed:', error);
        throw new Error(`Failed to update metadata: ${error.message}`);
    }
}

/**
 * Get wallet's SOL balance
 * @param {PublicKey} publicKey - Wallet public key
 * @returns {Promise<number>} Balance in SOL
 */
export async function getWalletBalance(publicKey) {
    try {
        const connection = new Connection(getRpcEndpoint(), 'confirmed');
        const balance = await connection.getBalance(publicKey);
        return balance / LAMPORTS_PER_SOL;
    } catch (error) {
        console.error('Failed to get wallet balance:', error);
        return 0;
    }
}
