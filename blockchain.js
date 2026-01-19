// Trap Stars Trait Shop - Blockchain Module
// Handles all blockchain transactions: SOL transfers, NFT transfers, metadata updates

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { transferV1 } from '@metaplex-foundation/mpl-core';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { publicKey as umiPublicKey, transactionBuilder } from '@metaplex-foundation/umi';
import { MEMO_PROGRAM_ID } from '@solana/spl-memo';

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
 * Create a memo instruction for adding transaction descriptions
 * @param {string} memo - The memo text to attach to the transaction
 * @param {PublicKey} signerPubkey - The public key of the transaction signer
 * @returns {TransactionInstruction} Memo instruction
 */
function createMemoInstruction(memo, signerPubkey) {
    const MAX_MEMO_LENGTH = 566;
    const truncatedMemo = memo.length > MAX_MEMO_LENGTH
        ? memo.substring(0, MAX_MEMO_LENGTH - 3) + '...'
        : memo;

    return new TransactionInstruction({
        keys: [{ pubkey: signerPubkey, isSigner: true, isWritable: false }],
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: Buffer.from(truncatedMemo, 'utf-8')
    });
}

/**
 * Transfer SOL from user's wallet to a recipient
 * @param {Object} walletAdapter - Phantom wallet adapter
 * @param {string} recipientAddress - Recipient wallet address
 * @param {number} amountSOL - Amount in SOL to transfer
 * @param {string} memo - Optional transaction description/memo
 * @returns {Promise<string>} Transaction signature
 */
export async function transferSOL(walletAdapter, recipientAddress, amountSOL, memo = null) {
    console.log(`💸 Transferring ${amountSOL} SOL to ${recipientAddress}...`);
    if (memo) {
        console.log(`📝 With memo: ${memo}`);
    }

    try {
        const connection = new Connection(getRpcEndpoint(), 'confirmed');

        const transaction = new Transaction();

        if (memo) {
            transaction.add(createMemoInstruction(memo, walletAdapter.publicKey));
        }

        transaction.add(
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
 * @param {string} memo - Optional transaction description/memo
 * @returns {Promise<string>} Transaction signature
 */
export async function transferNFT(walletAdapter, nftMint, recipientAddress, collectionAddress, memo = null) {
    console.log(`🎨 Transferring NFT ${nftMint} to ${recipientAddress}...`);
    if (memo) {
        console.log(`📝 With memo: ${memo}`);
    }

    try {
        const umi = createUmi(getRpcEndpoint());
        umi.use(walletAdapterIdentity(walletAdapter));

        console.log('📝 Creating transfer transaction...');

        let builder = transferV1(umi, {
            asset: umiPublicKey(nftMint),
            collection: umiPublicKey(collectionAddress),
            newOwner: umiPublicKey(recipientAddress)
        });

        if (memo) {
            const MAX_MEMO_LENGTH = 566;
            const truncatedMemo = memo.length > MAX_MEMO_LENGTH
                ? memo.substring(0, MAX_MEMO_LENGTH - 3) + '...'
                : memo;

            builder = builder.prepend({
                instruction: {
                    programId: umiPublicKey(MEMO_PROGRAM_ID.toString()),
                    keys: [{ pubkey: umi.identity.publicKey, isSigner: true, isWritable: false }],
                    data: new Uint8Array(Buffer.from(truncatedMemo, 'utf-8'))
                },
                signers: [umi.identity],
                bytesCreatedOnChain: 0
            });
        }

        const tx = await builder.sendAndConfirm(umi);

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
 * @param {Array<Object>} completeAttributes - Optional: Complete attributes array for batch mode
 * @returns {Promise<Object>} { signature, imageUrl, metadataUrl }
 */
export async function updateNFTMetadata(recipientNFT, traitType, newTraitValue, compositeImageDataUrl, useNewLogo = false, completeAttributes = null) {
    const isBatchMode = completeAttributes && completeAttributes.length > 0;

    console.log(`🔄 Updating NFT metadata for ${recipientNFT}...`);
    console.log(`   Mode: ${isBatchMode ? 'BATCH' : 'LEGACY'}`);

    if (isBatchMode) {
        console.log(`   Complete attributes: ${completeAttributes.length} traits`);
    } else {
        console.log(`   Trait: ${traitType} → ${newTraitValue}`);
    }
    console.log(`   New Logo: ${useNewLogo}`);

    try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Supabase configuration missing');
        }

        const functionUrl = `${supabaseUrl}/functions/v1/swap-trait`;

        console.log('📤 Calling edge function...');

        const requestBody = {
            recipientNFT,
            compositeImageDataUrl,
            useNewLogo
        };

        if (isBatchMode) {
            requestBody.completeAttributes = completeAttributes;
        } else {
            requestBody.traitType = traitType;
            requestBody.newTraitValue = newTraitValue;
        }

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'apikey': supabaseAnonKey
            },
            body: JSON.stringify(requestBody)
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
