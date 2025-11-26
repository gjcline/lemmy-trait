// Trap Stars Burn & Swap Module
// Handles the multi-step swap flow for burning one NFT to extract a trait for another

import { burnCompressedNFT, updateCompressedNFT, uploadImageToBundlr, uploadMetadataToBundlr, transferSOL } from './blockchain.js';

// Supabase client setup
let supabase = null;

// Initialize Supabase
export function initSupabase() {
    const { createClient } = window.supabase;
    supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
    );
}

// Create transaction record
export async function createSwapTransaction(walletAddress, donorNFT, recipientNFT, trait) {
    if (!supabase) initSupabase();

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
            status: 'pending'
        }])
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error creating swap transaction:', error);
        throw error;
    }

    return data;
}

// Update transaction record
export async function updateSwapTransaction(transactionId, updates) {
    if (!supabase) initSupabase();

    const { data, error } = await supabase
        .from('swap_transactions')
        .update(updates)
        .eq('id', transactionId)
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error updating swap transaction:', error);
        throw error;
    }

    return data;
}

// Get user's swap transaction history
export async function getUserSwapHistory(walletAddress) {
    if (!supabase) initSupabase();

    const { data, error } = await supabase
        .from('swap_transactions')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching swap history:', error);
        return [];
    }

    return data || [];
}

// Execute the complete burn and swap process
export async function executeBurnAndSwap(state, config, imageGeneratorFn, showProgressFn, walletAdapter) {
    const { donorNFT, recipientNFT, selectedTrait } = state.swap;
    let transactionId = null;

    try {
        // Step 1: Create transaction record
        showProgressFn('Creating transaction record...', '');
        const transaction = await createSwapTransaction(
            state.walletAddress,
            donorNFT,
            recipientNFT,
            selectedTrait
        );
        transactionId = transaction.id;
        console.log('✅ Transaction record created:', transactionId);

        // Step 2: Collect service fee from user
        showProgressFn('Processing service fee payment...', `Transferring ${config.serviceFeeSOL} SOL to fee wallet`);
        const serviceFeeSignature = await transferSOL(
            walletAdapter,
            config.feeRecipientWallet,
            parseFloat(config.serviceFeeSOL),
            config
        );
        console.log('✅ Service fee paid:', serviceFeeSignature);

        await updateSwapTransaction(transactionId, {
            service_fee_signature: serviceFeeSignature,
            service_fee_amount: parseFloat(config.serviceFeeSOL)
        });

        // Step 3: Collect reimbursement from user for blockchain costs
        showProgressFn('Processing cost reimbursement...', `Transferring ${config.reimbursementSOL} SOL to authority wallet`);
        const reimbursementSignature = await transferSOL(
            walletAdapter,
            config.updateAuthority,
            parseFloat(config.reimbursementSOL),
            config
        );
        console.log('✅ Reimbursement paid:', reimbursementSignature);

        await updateSwapTransaction(transactionId, {
            reimbursement_signature: reimbursementSignature,
            reimbursement_amount: parseFloat(config.reimbursementSOL),
            total_paid_by_user: parseFloat(config.serviceFeeSOL) + parseFloat(config.reimbursementSOL)
        });

        // Step 4: Burn the donor NFT
        showProgressFn('Burning donor NFT...', 'This will permanently destroy the NFT');
        const burnSignature = await burnCompressedNFT(donorNFT.mint, config);
        console.log('✅ Burn complete:', burnSignature);

        await updateSwapTransaction(transactionId, {
            burn_signature: burnSignature
        });

        // Step 5: Generate new image with swapped trait
        showProgressFn('Generating new image...', 'Compositing layers');
        const newAttributes = [...recipientNFT.attributes];

        // Remove existing trait of same category
        const existingIndex = newAttributes.findIndex(
            attr => attr.trait_type.toLowerCase() === selectedTrait.category.toLowerCase()
        );
        if (existingIndex !== -1) {
            newAttributes.splice(existingIndex, 1);
        }

        // Add new trait
        newAttributes.push({
            trait_type: selectedTrait.category,
            value: selectedTrait.value
        });

        // Generate image blob
        const imageBlob = await imageGeneratorFn(newAttributes);
        console.log('✅ Image generated');

        // Step 6: Upload new image to Arweave
        showProgressFn('Uploading image to Arweave...', 'This may take a moment');
        const imageUrl = await uploadImageToBundlr(imageBlob, config);
        console.log('✅ Image uploaded:', imageUrl);

        // Step 7: Create and upload new metadata
        showProgressFn('Uploading metadata to Arweave...', '');
        const newMetadata = {
            name: recipientNFT.name,
            symbol: 'TRAP',
            description: 'Trap Stars NFT with custom traits',
            image: imageUrl,
            attributes: newAttributes,
            properties: {
                files: [{
                    uri: imageUrl,
                    type: 'image/png'
                }],
                category: 'image'
            }
        };

        const metadataUrl = await uploadMetadataToBundlr(newMetadata, config);
        console.log('✅ Metadata uploaded:', metadataUrl);

        await updateSwapTransaction(transactionId, {
            new_image_url: imageUrl,
            new_metadata_url: metadataUrl
        });

        // Step 8: Update on-chain metadata
        showProgressFn('Updating NFT on-chain...', 'Signing with update authority');
        const updateSignature = await updateCompressedNFT(recipientNFT.mint, metadataUrl, config);
        console.log('✅ Metadata updated on-chain:', updateSignature);

        // Step 9: Mark transaction as complete
        await updateSwapTransaction(transactionId, {
            update_signature: updateSignature,
            status: 'completed',
            completed_at: new Date().toISOString(),
            cost_sol: parseFloat(config.serviceFeeSOL) + parseFloat(config.reimbursementSOL)
        });

        return {
            success: true,
            transactionId,
            serviceFeeSignature,
            reimbursementSignature,
            burnSignature,
            updateSignature,
            imageUrl,
            metadataUrl
        };

    } catch (error) {
        console.error('❌ Burn and swap failed:', error);

        // Update transaction as failed
        if (transactionId) {
            await updateSwapTransaction(transactionId, {
                status: 'failed',
                error_message: error.message
            });
        }

        throw error;
    }
}
