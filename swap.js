// Trap Stars Burn & Swap Module
// Handles the multi-step swap flow for burning one NFT to extract a trait for another

import { promptNFTSend, updateCompressedNFT, uploadImageToPinata, uploadMetadataToPinata, transferSOL } from './blockchain.js';

// Supabase client setup (optional)
let supabase = null;
let supabaseEnabled = false;

// Initialize Supabase (optional - won't throw error if not configured)
export function initSupabase(config) {
    if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
        console.warn('⚠️ Supabase not configured - transaction tracking disabled');
        supabaseEnabled = false;
        return;
    }
    try {
        const { createClient } = window.supabase;
        supabase = createClient(
            config.supabaseUrl,
            config.supabaseAnonKey
        );
        supabaseEnabled = true;
        console.log('✅ Supabase transaction tracking enabled');
    } catch (err) {
        console.warn('⚠️ Failed to initialize Supabase:', err);
        supabaseEnabled = false;
    }
}

// Create transaction record (optional)
export async function createSwapTransaction(walletAddress, donorNFT, recipientNFT, trait, config) {
    if (!supabase) initSupabase(config);

    if (!supabaseEnabled) {
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
                status: 'pending'
            }])
            .select()
            .maybeSingle();

        if (error) {
            console.error('Error creating swap transaction:', error);
            return { id: null };
        }

        return data;
    } catch (err) {
        console.error('Failed to create transaction record:', err);
        return { id: null };
    }
}

// Update transaction record (optional)
export async function updateSwapTransaction(transactionId, updates, config) {
    if (!supabaseEnabled || !transactionId) {
        return null;
    }

    if (!supabase) initSupabase(config);

    try {
        const { data, error } = await supabase
            .from('swap_transactions')
            .update(updates)
            .eq('id', transactionId)
            .select()
            .maybeSingle();

        if (error) {
            console.error('Error updating swap transaction:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('Failed to update transaction record:', err);
        return null;
    }
}

// Get user's swap transaction history
export async function getUserSwapHistory(walletAddress, config) {
    if (!supabase) initSupabase(config);

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
        // Validate NFT data
        console.log('🔍 Validating recipient NFT data...');
        console.log('Recipient NFT:', recipientNFT);
        console.log('Recipient attributes:', recipientNFT.attributes);

        if (!recipientNFT.attributes || recipientNFT.attributes.length === 0) {
            throw new Error('Recipient NFT has no attributes! Cannot perform swap.');
        }

        // Step 1: Create transaction record
        showProgressFn('Creating transaction record...', '');
        const transaction = await createSwapTransaction(
            state.walletAddress,
            donorNFT,
            recipientNFT,
            selectedTrait,
            config
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
        }, config);

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
        }, config);

        // Step 4: Transfer the donor NFT via compressed NFT transfer
        showProgressFn('Transferring donor NFT...', 'Please approve the transaction in Phantom');
        const transferSignature = await promptNFTSend(
            donorNFT.mint,
            config.feeRecipientWallet,
            walletAdapter,
            config
        );
        console.log('✅ NFT transferred:', transferSignature);

        await updateSwapTransaction(transactionId, {
            burn_signature: transferSignature
        }, config);

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

        // Step 6: Upload new image to IPFS
        showProgressFn('Uploading image to IPFS...', 'This may take a moment');
        const imageUrl = await uploadImageToPinata(imageBlob, config);
        console.log('✅ Image uploaded:', imageUrl);

        // Step 7: Create and upload new metadata
        showProgressFn('Uploading metadata to IPFS...', '');
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

        const metadataUrl = await uploadMetadataToPinata(newMetadata, config);
        console.log('✅ Metadata uploaded:', metadataUrl);

        await updateSwapTransaction(transactionId, {
            new_image_url: imageUrl,
            new_metadata_url: metadataUrl
        }, config);

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
        }, config);

        return {
            success: true,
            transactionId,
            serviceFeeSignature,
            reimbursementSignature,
            transferSignature,
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
            }, config);
        }

        throw error;
    }
}
