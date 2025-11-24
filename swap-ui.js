// Swap UI Functions
// Handles rendering and interaction for the 4-step burn & swap flow

function renderSwapStep(state, config) {
    const step = state.swap.step;
    const contentDiv = document.getElementById('swapStepContent');
    const nextBtn = document.getElementById('swapNextBtn');
    const backBtn = document.getElementById('swapBackBtn');

    // Update step indicators
    for (let i = 1; i <= 4; i++) {
        const indicator = document.getElementById(`stepIndicator${i}`);
        indicator.classList.remove('active', 'completed');
        if (i < step) {
            indicator.classList.add('completed');
        } else if (i === step) {
            indicator.classList.add('active');
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
        'Choose the Trap Star to burn for its trait',
        'Pick which trait you want to extract',
        'Choose which Trap Star will receive the trait',
        'Review and confirm the burn & swap transaction'
    ];

    document.getElementById('stepTitle').textContent = titles[step - 1];
    document.getElementById('stepDescription').textContent = descriptions[step - 1];

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
            renderStep4Confirmation(state, contentDiv, nextBtn);
            backBtn.textContent = '← Back';
            nextBtn.textContent = '🔥 Burn & Swap';
            break;
    }
}

// Step 1: Select donor NFT to burn
function renderStep1DonorSelection(state, contentDiv, nextBtn) {
    const html = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${state.nfts.map((nft, idx) => `
                <div onclick="selectDonorNFT(${idx})"
                     class="nft-card glass rounded-2xl p-5 cursor-pointer transition-all ${state.swap.donorNFT?.mint === nft.mint ? 'ring-2 ring-red-500' : ''}">
                    <div class="relative overflow-hidden rounded-xl mb-4">
                        <img src="${nft.image}" alt="${nft.name}" class="w-full aspect-square object-cover">
                        ${state.swap.donorNFT?.mint === nft.mint ? '<div class="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-semibold">DONOR</div>' : ''}
                    </div>
                    <h3 class="font-semibold mb-3 text-lg tracking-tight">${nft.name}</h3>
                    <div class="text-xs text-gray-400">
                        <p>${nft.attributes.length} traits</p>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="text-center mt-8 p-4 glass rounded-xl">
            <p class="text-yellow-300 text-sm">⚠️ The selected NFT will be permanently burned</p>
        </div>
    `;

    contentDiv.innerHTML = html;
    nextBtn.disabled = !state.swap.donorNFT;
    nextBtn.classList.toggle('opacity-50', !state.swap.donorNFT);
    nextBtn.classList.toggle('cursor-not-allowed', !state.swap.donorNFT);
}

// Step 2: Select trait from donor
function renderStep2TraitSelection(state, contentDiv, nextBtn) {
    const donor = state.swap.donorNFT;

    const html = `
        <div class="max-w-4xl mx-auto">
            <div class="glass rounded-2xl p-6 mb-8">
                <div class="flex items-center gap-4">
                    <img src="${donor.image}" alt="${donor.name}" class="w-24 h-24 rounded-xl">
                    <div>
                        <h3 class="text-xl font-semibold">${donor.name}</h3>
                        <p class="text-gray-400 text-sm">Donor NFT (Will be burned)</p>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                ${donor.attributes
                    .filter(attr => attr.trait_type.toLowerCase() !== 'logo')
                    .map(attr => `
                    <div onclick="selectTrait('${attr.trait_type}', '${attr.value}')"
                         class="trait-card glass rounded-xl p-4 ${
                             state.swap.selectedTrait?.category === attr.trait_type ? 'selected' : ''
                         }">
                        <div class="text-xs text-gray-400 uppercase mb-1">${attr.trait_type}</div>
                        <div class="font-semibold">${attr.value}</div>
                        ${state.swap.selectedTrait?.category === attr.trait_type ?
                            '<div class="mt-2 text-green-400 text-xs">✓ Selected</div>' : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    contentDiv.innerHTML = html;
    nextBtn.disabled = !state.swap.selectedTrait;
    nextBtn.classList.toggle('opacity-50', !state.swap.selectedTrait);
    nextBtn.classList.toggle('cursor-not-allowed', !state.swap.selectedTrait);
}

// Step 3: Select recipient NFT
function renderStep3RecipientSelection(state, contentDiv, nextBtn) {
    // Filter out the donor NFT
    const availableNFTs = state.nfts.filter(nft => nft.mint !== state.swap.donorNFT.mint);

    const html = `
        <div class="mb-6 glass rounded-xl p-4">
            <div class="flex items-center gap-3">
                <div class="text-2xl">🔥</div>
                <div>
                    <p class="text-sm text-gray-400">Extracting trait:</p>
                    <p class="font-semibold">${state.swap.selectedTrait.category}: ${state.swap.selectedTrait.value}</p>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${availableNFTs.map((nft, idx) => `
                <div onclick="selectRecipientNFT(${state.nfts.indexOf(nft)})"
                     class="nft-card glass rounded-2xl p-5 cursor-pointer transition-all ${
                         state.swap.recipientNFT?.mint === nft.mint ? 'ring-2 ring-green-500' : ''
                     }">
                    <div class="relative overflow-hidden rounded-xl mb-4">
                        <img src="${nft.image}" alt="${nft.name}" class="w-full aspect-square object-cover">
                        ${state.swap.recipientNFT?.mint === nft.mint ?
                            '<div class="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold">RECIPIENT</div>' : ''}
                    </div>
                    <h3 class="font-semibold mb-3 text-lg tracking-tight">${nft.name}</h3>
                    <div class="text-xs text-gray-400">
                        <p>${nft.attributes.length} traits</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    contentDiv.innerHTML = html;
    nextBtn.disabled = !state.swap.recipientNFT;
    nextBtn.classList.toggle('opacity-50', !state.swap.recipientNFT);
    nextBtn.classList.toggle('cursor-not-allowed', !state.swap.recipientNFT);
}

// Step 4: Confirmation
function renderStep4Confirmation(state, contentDiv, nextBtn) {
    const donor = state.swap.donorNFT;
    const recipient = state.swap.recipientNFT;
    const trait = state.swap.selectedTrait;

    const html = `
        <div class="max-w-4xl mx-auto">
            <!-- Preview Section -->
            <div class="glass rounded-2xl p-6 mb-8">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="text-lg font-semibold">Preview Result</h4>
                    <button onclick="generateSwapPreview()" id="generatePreviewBtn" class="btn-primary px-6 py-2 rounded-lg text-sm">
                        🔮 Generate Preview
                    </button>
                </div>
                <div id="swapPreviewContainer" class="hidden">
                    <div class="grid md:grid-cols-3 gap-4 items-center">
                        <div>
                            <p class="text-xs text-gray-400 mb-2 text-center">Current</p>
                            <img src="${recipient.image}" alt="Current" class="w-full rounded-lg border border-white/10">
                        </div>
                        <div class="text-center text-2xl">→</div>
                        <div>
                            <p class="text-xs text-gray-400 mb-2 text-center">After Swap</p>
                            <div id="previewImageContainer" class="relative">
                                <div class="absolute inset-0 flex items-center justify-center">
                                    <div class="spinner"></div>
                                </div>
                                <img id="swapPreviewImage" src="" alt="Preview" class="w-full rounded-lg border-2 border-green-500/50" style="display: none;">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="grid md:grid-cols-2 gap-6 mb-8">
                <!-- Donor NFT -->
                <div class="glass rounded-2xl p-6">
                    <div class="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
                        <p class="text-red-300 text-sm font-semibold">🔥 Will Be Burned</p>
                    </div>
                    <img src="${donor.image}" alt="${donor.name}" class="w-full rounded-xl mb-4">
                    <h3 class="text-xl font-semibold mb-2">${donor.name}</h3>
                    <p class="text-gray-400 text-sm mb-3">Extracting: ${trait.category} - ${trait.value}</p>
                </div>

                <!-- Recipient NFT -->
                <div class="glass rounded-2xl p-6">
                    <div class="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4">
                        <p class="text-green-300 text-sm font-semibold">✨ Will Receive Trait</p>
                    </div>
                    <img src="${recipient.image}" alt="${recipient.name}" class="w-full rounded-xl mb-4">
                    <h3 class="text-xl font-semibold mb-2">${recipient.name}</h3>
                    <p class="text-gray-400 text-sm mb-3">Will gain: ${trait.category} - ${trait.value}</p>
                </div>
            </div>

            <!-- Cost Breakdown -->
            <div class="glass rounded-2xl p-6">
                <h4 class="text-lg font-semibold mb-4">Transaction Cost Breakdown</h4>
                <div class="space-y-3">
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Burn Transaction Fee</span>
                        <span class="font-mono">~0.001 SOL</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Image Upload (Arweave)</span>
                        <span class="font-mono">~0.01 SOL</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Metadata Upload (Arweave)</span>
                        <span class="font-mono">~0.001 SOL</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Update Transaction Fee</span>
                        <span class="font-mono">~0.001 SOL</span>
                    </div>
                    <div class="border-t border-white/10 pt-3 mt-3">
                        <div class="flex justify-between items-center text-lg font-semibold">
                            <span>Total Estimated Cost</span>
                            <span class="font-mono">~0.013 SOL</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Warning -->
            <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-6 mt-6">
                <div class="flex gap-4">
                    <div class="text-3xl">⚠️</div>
                    <div class="flex-1">
                        <h4 class="font-semibold text-red-300 mb-2">Important Warning</h4>
                        <ul class="text-sm text-gray-300 space-y-2">
                            <li>• <strong>${donor.name}</strong> will be permanently burned and cannot be recovered</li>
                            <li>• This action is irreversible once the transaction is confirmed</li>
                            <li>• Make sure you have enough SOL to cover transaction costs</li>
                            <li>• The burn and update will be executed by the update authority wallet</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;

    contentDiv.innerHTML = html;
    nextBtn.disabled = false;
    nextBtn.classList.remove('opacity-50', 'cursor-not-allowed');
}

// Make functions globally available
window.selectDonorNFT = selectDonorNFT;
window.selectTrait = selectTrait;
window.selectRecipientNFT = selectRecipientNFT;

function selectDonorNFT(idx) {
    window.appState.swap.donorNFT = window.appState.nfts[idx];
    window.renderSwapStep(window.appState, window.appConfig);
}

function selectTrait(category, value) {
    window.appState.swap.selectedTrait = { category, value };
    window.renderSwapStep(window.appState, window.appConfig);
}

function selectRecipientNFT(idx) {
    window.appState.swap.recipientNFT = window.appState.nfts[idx];
    window.renderSwapStep(window.appState, window.appConfig);
}

// Generate preview of the swap result
async function generateSwapPreview() {
    const state = window.appState;
    const recipient = state.swap.recipientNFT;
    const trait = state.swap.selectedTrait;

    // Show the preview container
    const container = document.getElementById('swapPreviewContainer');
    const previewImg = document.getElementById('swapPreviewImage');
    const generateBtn = document.getElementById('generatePreviewBtn');

    container.classList.remove('hidden');
    previewImg.style.display = 'none';

    // Disable button during generation
    generateBtn.disabled = true;
    generateBtn.textContent = '⏳ Generating...';

    try {
        // Create new attributes with swapped trait
        const newAttributes = [...recipient.attributes];

        // Remove existing trait of same category
        const existingIndex = newAttributes.findIndex(
            attr => attr.trait_type.toLowerCase() === trait.category.toLowerCase()
        );
        if (existingIndex !== -1) {
            newAttributes.splice(existingIndex, 1);
        }

        // Add new trait
        newAttributes.push({
            trait_type: trait.category,
            value: trait.value
        });

        // Generate preview image
        const imageBlob = await window.generateImageFromTraits(newAttributes);
        const imageUrl = URL.createObjectURL(imageBlob);

        // Display preview
        previewImg.src = imageUrl;
        previewImg.style.display = 'block';

        // Re-enable button
        generateBtn.disabled = false;
        generateBtn.textContent = '🔄 Regenerate Preview';

    } catch (error) {
        console.error('Failed to generate preview:', error);
        alert('Failed to generate preview: ' + error.message);

        // Re-enable button
        generateBtn.disabled = false;
        generateBtn.textContent = '🔮 Generate Preview';
        container.classList.add('hidden');
    }
}

// Export to window
window.renderSwapStep = renderSwapStep;
window.generateSwapPreview = generateSwapPreview;
