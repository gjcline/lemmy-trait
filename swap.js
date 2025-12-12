// Trap Stars Trait Shop - Swap Orchestration Module
// Handles the complete multi-step swap flow with transaction tracking

import { transferSOL, transferNFT, updateNFTMetadata, getWalletBalance } from './blockchain.js';

// Supabase client setup
let supabase = null;
let supabaseEnabled = false;

/**
 * Initialize Supabase for transaction tracking
 */
export function initSupabase() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.warn('⚠️ Supabase not configured - transaction tracking disabled');
        supabaseEnabled = false;
        return;
    }

    try {
        if (window.supabase) {
            const { createClient } = window.supabase;
            supabase = createClient(supabaseUrl, supabaseAnonKey);
            supabaseEnabled = true;
            console.log('✅ Supabase transaction tracking enabled');
        }
    } catch (err) {
        console.warn('⚠️ Failed to initialize Supabase:', err);
        supabaseEnabled = false;
    }
}

/**
 * Create a transaction record in Supabase
 */
async function createTransactionRecord(walletAddress, donorNFT, recipientNFT, trait) {
    if (!supabaseEnabled || !supabase) {
        console.log('📝 Transaction tracking disabled - skipping database record');
        return { id: null };
    }

    try {
        const { data, error } = await supabase
            .from('swap_transactions')
            .insert([{
                wallet_address: walletAddress,
                donor_mint: donorNFT.mint,
                donor_name: donorNFT.name,
                recipient_mint: recipientNFT.mint,
                recipient_name: recipientNFT.name,
                swapped_trait_category: trait.category,
                swapped_trait_value: trait.value,
                service_fee_amount: parseFloat(import.meta.env.VITE_SERVICE_FEE),
                reimbursement_amount: parseFloat(import.meta.env.VITE_REIMBURSEMENT_FEE),
                status: 'pending'
            }])
            .select()
            .single();

        if (error) throw error;
        console.log('✅ Transaction record created:', data.id);
        return data;
    } catch (error) {
        console.error('Failed to create transaction record:', error);
        return { id: null };
    }
}

/**
 * Update transaction record with signatures
 */
async function updateTransactionRecord(transactionId, updates) {
    if (!supabaseEnabled || !supabase || !transactionId) return;

    try {
        const { error } = await supabase
            .from('swap_transactions')
            .update(updates)
            .eq('id', transactionId);

        if (error) throw error;
        console.log('✅ Transaction record updated');
    } catch (error) {
        console.error('Failed to update transaction record:', error);
    }
}

/**
 * Execute the complete trait swap flow
 * @param {Object} walletAdapter - Phantom wallet adapter
 * @param {Object} donorNFT - NFT to transfer (donor)
 * @param {Object} recipientNFT - NFT to receive trait (recipient)
 * @param {Object} trait - { category, value } of trait to swap
 * @param {string} compositeImageDataUrl - Base64 data URL of composite image
 * @param {Function} progressCallback - Called with progress updates (step, message)
 * @param {boolean} useNewLogo - Whether to update the Logo trait to "Uzi"
 * @returns {Promise<Object>} All transaction signatures and URLs
 */
export async function executeSwap(walletAdapter, donorNFT, recipientNFT, trait, compositeImageDataUrl, progressCallback = null, useNewLogo = false) {
    console.log('🚀 Starting trait swap execution...');
    console.log('   Use New Logo:', useNewLogo);

    const results = {
        serviceFeeSignature: null,
        reimbursementFeeSignature: null,
        nftTransferSignature: null,
        metadataUpdateSignature: null,
        imageUrl: null,
        metadataUrl: null,
        transactionId: null
    };

    const updateProgress = (step, message) => {
        console.log(`[Step ${step}] ${message}`);
        if (progressCallback) progressCallback(step, message);
    };

    try {
        // Get environment variables
        const collectionWallet = import.meta.env.VITE_COLLECTION_WALLET;
        const reimbursementWallet = import.meta.env.VITE_REIMBURSEMENT_WALLET;
        const serviceFee = parseFloat(import.meta.env.VITE_SERVICE_FEE);
        const reimbursementFee = parseFloat(import.meta.env.VITE_REIMBURSEMENT_FEE);
        const collectionAddress = import.meta.env.VITE_COLLECTION_ADDRESS;

        if (!collectionWallet || !reimbursementWallet || !collectionAddress) {
            throw new Error('Missing required environment variables');
        }

        // Validate wallet has sufficient balance
        const totalFees = serviceFee + reimbursementFee;
        updateProgress(0, 'Checking wallet balance...');
        const balance = await getWalletBalance(walletAdapter.publicKey);

        if (balance < totalFees + 0.01) { // Add 0.01 SOL buffer for transaction fees
            throw new Error(`Insufficient balance. Need ${totalFees + 0.01} SOL, have ${balance.toFixed(4)} SOL`);
        }

        // Create transaction record
        updateProgress(0, 'Creating transaction record...');
        const transaction = await createTransactionRecord(
            walletAdapter.publicKey.toString(),
            donorNFT,
            recipientNFT,
            trait
        );
        results.transactionId = transaction.id;

        // STEP 1: Service Fee Transfer
        updateProgress(1, `Transferring service fee (${serviceFee} SOL)...`);
        results.serviceFeeSignature = await transferSOL(
            walletAdapter,
            collectionWallet,
            serviceFee
        );

        if (transaction.id) {
            await updateTransactionRecord(transaction.id, {
                service_fee_signature: results.serviceFeeSignature
            });
        }

        // STEP 2: Reimbursement Fee Transfer
        updateProgress(2, `Transferring reimbursement fee (${reimbursementFee} SOL)...`);
        results.reimbursementFeeSignature = await transferSOL(
            walletAdapter,
            reimbursementWallet,
            reimbursementFee
        );

        if (transaction.id) {
            await updateTransactionRecord(transaction.id, {
                reimbursement_fee_signature: results.reimbursementFeeSignature
            });
        }

        // STEP 3: Transfer Donor NFT to Collection Wallet
        updateProgress(3, 'Transferring donor NFT to collection wallet...');
        results.nftTransferSignature = await transferNFT(
            walletAdapter,
            donorNFT.mint,
            collectionWallet,
            collectionAddress
        );

        if (transaction.id) {
            await updateTransactionRecord(transaction.id, {
                nft_transfer_signature: results.nftTransferSignature
            });
        }

        // STEP 4: Update Recipient NFT Metadata
        updateProgress(4, 'Updating recipient NFT metadata...');
        const metadataResult = await updateNFTMetadata(
            recipientNFT.mint,
            trait.category,
            trait.value,
            compositeImageDataUrl,
            useNewLogo
        );

        results.metadataUpdateSignature = metadataResult.signature;
        results.imageUrl = metadataResult.imageUrl;
        results.metadataUrl = metadataResult.metadataUrl;

        // Final update - mark as completed
        if (transaction.id) {
            await updateTransactionRecord(transaction.id, {
                metadata_update_signature: results.metadataUpdateSignature,
                image_url: results.imageUrl,
                metadata_url: results.metadataUrl,
                status: 'completed',
                completed_at: new Date().toISOString()
            });
        }

        updateProgress(5, 'Swap completed successfully! ✅');
        console.log('🎉 Trait swap complete!');
        console.log('Results:', results);

        return results;

    } catch (error) {
        console.error('❌ Swap execution failed:', error);

        // Mark transaction as failed
        if (results.transactionId) {
            await updateTransactionRecord(results.transactionId, {
                status: 'failed',
                error_message: error.message
            });
        }

        throw error;
    }
}

/**
 * Validate swap parameters before execution
 */
export function validateSwapParams(donorNFT, recipientNFT, trait) {
    if (!donorNFT || !recipientNFT) {
        throw new Error('Both donor and recipient NFTs must be selected');
    }

    if (donorNFT.mint === recipientNFT.mint) {
        throw new Error('Donor and recipient NFTs cannot be the same');
    }

    if (!trait || !trait.category || !trait.value) {
        throw new Error('Valid trait must be selected');
    }

    return true;
}

// Initialize Supabase on module load
initSupabase();
