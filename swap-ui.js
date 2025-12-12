// Swap UI Functions
// Handles rendering and interaction for the 4-step burn & swap flow

/**
 * Render the current step of the swap flow
 * @param {Object} state - Application state
 * @param {Object} config - Configuration object
 */
window.renderSwapStep = function(state, config) {
    const step = state.swap.step;
    const contentDiv = document.getElementById('swapStepContent');
    const nextBtn = document.getElementById('swapNextBtn');
    const backBtn = document.getElementById('swapBackBtn');

    if (!contentDiv || !nextBtn || !backBtn) {
        console.error('Swap UI elements not found');
        return;
    }

    // Update step indicators
    for (let i = 1; i <= 4; i++) {
        const indicator = document.getElementById(`stepIndicator${i}`);
        if (indicator) {
            indicator.classList.remove('active', 'completed');
            if (i < step) {
                indicator.classList.add('completed');
            } else if (i === step) {
                indicator.classList.add('active');
            }
        }
    }

    // Update title and description
    const titles = [
        'Select Donor NFT',
        'Choose Trait to Extract',
        'Select Recipient NFT',
        'Confirm & Execute'
    ];
    const descriptions = [
        'Choose the Trap Star to transfer to collection wallet for its trait',
        'Pick which trait you want to extract',
        'Choose which Trap Star will receive the trait',
        'Review and confirm the swap transaction'
    ];

    const titleEl = document.getElementById('stepTitle');
    const descEl = document.getElementById('stepDescription');
    if (titleEl) titleEl.textContent = titles[step - 1];
    if (descEl) descEl.textContent = descriptions[step - 1];

    // Render step content
    switch (step) {
        case 1:
            renderStep1DonorSelection(state, contentDiv, nextBtn);
            backBtn.textContent = '← Cancel';
            break;
        case 2:
            renderStep2TraitSelection(state, contentDiv, nextBtn);
            backBtn.textContent = '← Back';
            break;
        case 3:
            renderStep3RecipientSelection(state, contentDiv, nextBtn);
            backBtn.textContent = '← Back';
            break;
        case 4:
            renderStep4Confirmation(state, contentDiv, nextBtn, config);
            backBtn.textContent = '← Back';
            break;
    }
};

/**
 * Step 1: Select Donor NFT
 */
function renderStep1DonorSelection(state, contentDiv, nextBtn) {
    const nfts = state.nfts;

    if (!nfts || nfts.length === 0) {
        contentDiv.innerHTML = `
            <div class="text-center py-12">
                <p class="text-gray-400">No NFTs found in your wallet</p>
            </div>
        `;
        nextBtn.disabled = true;
        return;
    }

    contentDiv.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            ${nfts.map((nft, index) => `
                <div class="nft-card glass rounded-xl p-4 cursor-pointer ${state.swap.donorNFT?.mint === nft.mint ? 'border-2 border-green-500' : ''}"
                     data-nft-index="${index}">
                    <img src="${nft.image}" alt="${nft.name}" class="w-full rounded-lg mb-3">
                    <h3 class="text-sm font-semibold truncate">${nft.name}</h3>
                    <p class="text-xs text-gray-400 truncate">Mint: ${nft.mint.substring(0, 8)}...</p>
                </div>
            `).join('')}
        </div>
    `;

    // Add click handlers
    contentDiv.querySelectorAll('.nft-card').forEach((card, index) => {
        card.addEventListener('click', () => {
            state.swap.donorNFT = nfts[index];
            renderStep1DonorSelection(state, contentDiv, nextBtn);
        });
    });

    // Enable next button if donor is selected
    nextBtn.disabled = !state.swap.donorNFT;
}

/**
 * Step 2: Choose Trait to Extract
 */
function renderStep2TraitSelection(state, contentDiv, nextBtn) {
    const donor = state.swap.donorNFT;

    if (!donor || !donor.attributes) {
        contentDiv.innerHTML = `
            <div class="text-center py-12">
                <p class="text-gray-400">No traits found for selected NFT</p>
            </div>
        `;
        nextBtn.disabled = true;
        return;
    }

    // Filter out traits that shouldn't be swappable
    const swappableTraits = donor.attributes.filter(attr => {
        const category = attr.trait_type.toLowerCase();
        // Allow all traits except logo
        return category !== 'logo';
    });

    contentDiv.innerHTML = `
        <div class="glass rounded-2xl p-6 mb-6">
            <h3 class="text-lg font-semibold mb-4">Donor NFT</h3>
            <div class="flex items-center gap-4">
                <img src="${donor.image}" alt="${donor.name}" class="w-24 h-24 rounded-lg">
                <div>
                    <p class="font-semibold">${donor.name}</p>
                    <p class="text-xs text-gray-400">Select a trait to extract</p>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${swappableTraits.map(attr => `
                <div class="trait-card glass rounded-xl p-4 ${state.swap.selectedTrait?.category === attr.trait_type ? 'selected' : ''}"
                     data-trait-category="${attr.trait_type}"
                     data-trait-value="${attr.value}">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="text-xs text-gray-400 uppercase tracking-wider">${attr.trait_type}</p>
                            <p class="text-sm font-semibold mt-1">${attr.value}</p>
                        </div>
                        ${state.swap.selectedTrait?.category === attr.trait_type ?
                            '<div class="text-green-500 text-2xl">✓</div>' : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Add click handlers
    contentDiv.querySelectorAll('.trait-card').forEach(card => {
        card.addEventListener('click', () => {
            const category = card.dataset.traitCategory;
            const value = card.dataset.traitValue;
            state.swap.selectedTrait = { category, value };
            renderStep2TraitSelection(state, contentDiv, nextBtn);
        });
    });

    // Enable next button if trait is selected
    nextBtn.disabled = !state.swap.selectedTrait;
}

/**
 * Step 3: Select Recipient NFT
 */
function renderStep3RecipientSelection(state, contentDiv, nextBtn) {
    // Filter out the donor NFT
    const availableNFTs = state.nfts.filter(nft => nft.mint !== state.swap.donorNFT?.mint);

    if (availableNFTs.length === 0) {
        contentDiv.innerHTML = `
            <div class="text-center py-12">
                <p class="text-gray-400">No other NFTs available. You need at least 2 NFTs to perform a swap.</p>
            </div>
        `;
        nextBtn.disabled = true;
        return;
    }

    contentDiv.innerHTML = `
        <div class="glass rounded-2xl p-6 mb-6">
            <h3 class="text-lg font-semibold mb-3">Selected Trait</h3>
            <div class="flex items-center gap-3">
                <div class="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg">
                    <p class="text-xs uppercase tracking-wider">${state.swap.selectedTrait?.category}</p>
                    <p class="text-sm font-bold">${state.swap.selectedTrait?.value}</p>
                </div>
                <p class="text-gray-400 text-sm">← This trait will be applied to recipient</p>
            </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            ${availableNFTs.map((nft, index) => `
                <div class="nft-card glass rounded-xl p-4 cursor-pointer ${state.swap.recipientNFT?.mint === nft.mint ? 'border-2 border-blue-500' : ''}"
                     data-nft-index="${index}">
                    <img src="${nft.image}" alt="${nft.name}" class="w-full rounded-lg mb-3">
                    <h3 class="text-sm font-semibold truncate">${nft.name}</h3>
                    <p class="text-xs text-gray-400 truncate">Mint: ${nft.mint.substring(0, 8)}...</p>
                </div>
            `).join('')}
        </div>
    `;

    // Add click handlers
    contentDiv.querySelectorAll('.nft-card').forEach((card, index) => {
        card.addEventListener('click', () => {
            state.swap.recipientNFT = availableNFTs[index];
            renderStep3RecipientSelection(state, contentDiv, nextBtn);
        });
    });

    // Enable next button if recipient is selected
    nextBtn.disabled = !state.swap.recipientNFT;
}

/**
 * Step 4: Confirmation
 */
function renderStep4Confirmation(state, contentDiv, nextBtn, config) {
    const serviceFee = parseFloat(import.meta.env.VITE_SERVICE_FEE || '0.0025');
    const reimbursementFee = parseFloat(import.meta.env.VITE_REIMBURSEMENT_FEE || '0.015');
    const totalFees = serviceFee + reimbursementFee;

    contentDiv.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-6">
            <!-- Summary Card -->
            <div class="glass rounded-2xl p-6">
                <h3 class="text-xl font-semibold mb-6">Transaction Summary</h3>

                <!-- Donor NFT -->
                <div class="mb-6 pb-6 border-b border-gray-700">
                    <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">Donor NFT (Will be transferred)</p>
                    <div class="flex items-center gap-4">
                        <img src="${state.swap.donorNFT.image}" alt="${state.swap.donorNFT.name}"
                             class="w-20 h-20 rounded-lg">
                        <div>
                            <p class="font-semibold">${state.swap.donorNFT.name}</p>
                            <p class="text-xs text-gray-400 font-mono">${state.swap.donorNFT.mint.substring(0, 16)}...</p>
                        </div>
                    </div>
                </div>

                <!-- Trait Being Extracted -->
                <div class="mb-6 pb-6 border-b border-gray-700">
                    <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">Trait to Extract</p>
                    <div class="bg-green-500/20 text-green-400 inline-block px-6 py-3 rounded-lg">
                        <p class="text-xs uppercase tracking-wider">${state.swap.selectedTrait.category}</p>
                        <p class="text-lg font-bold">${state.swap.selectedTrait.value}</p>
                    </div>
                </div>

                <!-- Recipient NFT -->
                <div class="mb-6">
                    <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">Recipient NFT (Will receive trait)</p>
                    <div class="flex items-center gap-4">
                        <img src="${state.swap.recipientNFT.image}" alt="${state.swap.recipientNFT.name}"
                             class="w-20 h-20 rounded-lg">
                        <div>
                            <p class="font-semibold">${state.swap.recipientNFT.name}</p>
                            <p class="text-xs text-gray-400 font-mono">${state.swap.recipientNFT.mint.substring(0, 16)}...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Preview Section -->
            <div id="preview-section" class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">Preview</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div class="text-center">
                        <p class="text-sm text-gray-400 mb-2">Current</p>
                        <img src="${state.swap.recipientNFT.image}"
                             alt="Current"
                             class="w-full rounded-lg border-2 border-gray-700">
                    </div>
                    <div class="text-center">
                        <p class="text-sm text-gray-400 mb-2">After Swap</p>
                        <div id="preview-loading" class="flex items-center justify-center aspect-square bg-gray-800 rounded-lg border-2 border-gray-700">
                            <div class="text-center">
                                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-2"></div>
                                <p class="text-xs text-gray-400">Generating preview...</p>
                            </div>
                        </div>
                        <img id="preview-image"
                             alt="Preview"
                             class="w-full rounded-lg border-2 border-green-500 hidden">
                    </div>
                </div>

                <!-- Logo Option -->
                <div class="mt-6 pt-6 border-t border-gray-700">
                    <label class="flex items-center gap-4 cursor-pointer group">
                        <input type="checkbox" id="use-new-logo-checkbox" checked
                               class="w-5 h-5 rounded border-gray-600 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900 cursor-pointer">
                        <div class="flex items-center gap-3 flex-1">
                            <img src="https://trapstars-assets.netlify.app/logo/new%20logo.png"
                                 alt="Uzi Logo"
                                 class="w-12 h-12 rounded-lg border border-gray-600 object-cover">
                            <div>
                                <p class="font-semibold text-white group-hover:text-green-400 transition-colors">Include New Logo</p>
                                <p class="text-xs text-gray-400">Upgrade to the exclusive Uzi logo overlay</p>
                            </div>
                        </div>
                    </label>
                </div>
            </div>

            <!-- Fee Breakdown -->
            <div class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">Fee Breakdown</h3>
                <div class="space-y-3">
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-400">Service Fee</span>
                        <span class="font-mono">${serviceFee} SOL</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-400">Reimbursement Fee</span>
                        <span class="font-mono">${reimbursementFee} SOL</span>
                    </div>
                    <div class="border-t border-gray-700 pt-3 flex justify-between font-semibold">
                        <span>Total Fees</span>
                        <span class="font-mono text-lg">${totalFees.toFixed(4)} SOL</span>
                    </div>
                </div>
            </div>

            <!-- Warning -->
            <div class="glass-light rounded-xl p-4 border border-yellow-500/30">
                <div class="flex items-start gap-3">
                    <div class="text-2xl">⚠️</div>
                    <div class="flex-1">
                        <p class="text-sm text-yellow-200 font-semibold mb-2">Important Notice</p>
                        <ul class="text-xs text-gray-300 space-y-1">
                            <li>• Donor NFT will be transferred to collection wallet</li>
                            <li>• Recipient NFT will be updated with the selected trait</li>
                            <li>• This action cannot be undone</li>
                            <li>• Make sure you have sufficient SOL for fees (~${(totalFees + 0.01).toFixed(4)} SOL including gas)</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Initialize logo preference state (default to true)
    if (state.swap.useNewLogo === undefined) {
        state.swap.useNewLogo = true;
    }

    // Generate preview asynchronously
    if (window.generateImageForSwap) {
        window.generateImageForSwap().then(dataUrl => {
            const previewImg = document.getElementById('preview-image');
            const loading = document.getElementById('preview-loading');

            if (previewImg && loading) {
                previewImg.src = dataUrl;
                previewImg.classList.remove('hidden');
                loading.classList.add('hidden');

                // Store for use in execution
                state.swap.compositeImageDataUrl = dataUrl;
                console.log('✅ Preview image generated and cached');
            }
        }).catch(error => {
            console.error('Preview generation failed:', error);
            const loading = document.getElementById('preview-loading');
            if (loading) {
                loading.innerHTML = `
                    <div class="text-center">
                        <p class="text-red-400 text-sm mb-2">Preview failed</p>
                        <p class="text-xs text-gray-500">${error.message}</p>
                    </div>
                `;
            }
        });
    }

    // Handle logo checkbox change
    const logoCheckbox = document.getElementById('use-new-logo-checkbox');
    if (logoCheckbox) {
        logoCheckbox.addEventListener('change', async (e) => {
            state.swap.useNewLogo = e.target.checked;
            console.log(`Logo preference changed: ${state.swap.useNewLogo ? 'New Uzi Logo' : 'Trap Stars Logo'}`);

            // Regenerate preview with new logo preference
            const previewImg = document.getElementById('preview-image');
            const loading = document.getElementById('preview-loading');

            if (previewImg && loading) {
                // Show loading state
                previewImg.classList.add('hidden');
                loading.classList.remove('hidden');

                try {
                    const dataUrl = await window.generateImageForSwap();
                    previewImg.src = dataUrl;
                    previewImg.classList.remove('hidden');
                    loading.classList.add('hidden');
                    state.swap.compositeImageDataUrl = dataUrl;
                    console.log('✅ Preview updated with new logo preference');
                } catch (error) {
                    console.error('Preview regeneration failed:', error);
                    loading.innerHTML = `
                        <div class="text-center">
                            <p class="text-red-400 text-sm mb-2">Preview update failed</p>
                            <p class="text-xs text-gray-500">${error.message}</p>
                        </div>
                    `;
                }
            }
        });
    } else {
        console.error('generateImageForSwap not available');
    }

    // Change next button to "Execute Swap"
    nextBtn.textContent = 'Execute Swap →';
    nextBtn.classList.add('bg-green-500', 'hover:bg-green-600');
    nextBtn.disabled = false;
}

console.log('✅ Swap UI module loaded');
