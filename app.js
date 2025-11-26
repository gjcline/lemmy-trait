// Trap Stars Trait Shop - Production App
// This file handles all wallet connections, NFT fetching, image generation, and blockchain transactions

import { Buffer } from 'buffer';
window.Buffer = Buffer;

import { DotShaderBackground } from './shader-background.js';
import { getBackgroundUrl } from './background-urls.js';

// Netlify assets base URL
const NETLIFY_ASSETS_BASE = 'https://trapstars-assets.netlify.app';

// Helper function to construct Netlify asset URLs
function getTraitImageUrl(category, traitName) {
    const encodedCategory = encodeURIComponent(category.toLowerCase());
    const encodedName = encodeURIComponent(traitName.toLowerCase());
    return `${NETLIFY_ASSETS_BASE}/${encodedCategory}/${encodedName}.png`;
}

// Load configuration
let config = null;
let shaderBackground = null;


// State management
const state = {
    walletAddress: null,
    nfts: [],
    traitLayers: {},
    selectedNFT: null,
    customTraits: {}, // Store selected custom traits
    previewImage: null,
    mode: null, // 'playground' or 'swap'
    // Swap-specific state
    swap: {
        step: 1, // Current step in swap flow (1-4)
        donorNFT: null, // NFT to burn for trait
        recipientNFT: null, // NFT to receive trait
        selectedTrait: null, // {category, value} of trait to swap
        transactionSignatures: {} // Store burn and update signatures
    }
};

// Initialize app
async function init() {
    console.log('🚀 Trap Stars Trait Shop - Production Mode');
    console.log('Environment check:', {
        hasHeliusKey: !!import.meta.env.VITE_HELIUS_API_KEY,
        hasCollection: !!import.meta.env.VITE_COLLECTION_ADDRESS,
        mode: import.meta.env.MODE
    });

    // Initialize shader background
    const shaderContainer = document.getElementById('shader-background');
    if (shaderContainer) {
        shaderBackground = new DotShaderBackground(shaderContainer);
        console.log('✅ Shader background initialized');
    }

    let configLoaded = false;

    // Try environment variables first (production)
    if (import.meta.env.VITE_HELIUS_API_KEY) {
        try {
            config = {
                heliusApiKey: import.meta.env.VITE_HELIUS_API_KEY,
                collectionAddress: import.meta.env.VITE_COLLECTION_ADDRESS,
                updateAuthority: import.meta.env.VITE_UPDATE_AUTHORITY,
                updateAuthorityPrivateKey: JSON.parse(import.meta.env.VITE_UPDATE_AUTHORITY_PRIVATE_KEY || '[]'),
                rpcEndpoint: import.meta.env.VITE_RPC_ENDPOINT,
                layerOrder: JSON.parse(import.meta.env.VITE_LAYER_ORDER || '["background","body","shirt","weapons","accessories","logo","meme","iceout chain","face","mouth","eyes","eyebrows","hair","eyewear","headwear"]'),
                optionalLayers: JSON.parse(import.meta.env.VITE_OPTIONAL_LAYERS || '["face","eyewear","headwear","accessories","weapons","iceout chain"]'),
                imageSize: parseInt(import.meta.env.VITE_IMAGE_SIZE || '1750'),
                feeRecipientWallet: import.meta.env.VITE_FEE_RECIPIENT_WALLET,
                serviceFeeSOL: import.meta.env.VITE_SERVICE_FEE_SOL || '0.025',
                reimbursementSOL: import.meta.env.VITE_REIMBURSEMENT_SOL || '0.015'
            };
            console.log('✅ Configuration loaded from environment variables');
            configLoaded = true;
        } catch (err) {
            console.error('❌ Error parsing environment variables:', err);
        }
    }

    // Fall back to config.json if env vars not available (local development)
    if (!configLoaded) {
        try {
            console.log('Attempting to load config.json...');
            const response = await fetch('config.json');
            if (response.ok) {
                config = await response.json();
                console.log('✅ Configuration loaded from config.json');
                configLoaded = true;
            }
        } catch (err) {
            console.log('config.json not available');
        }
    }

    // If no config loaded, show error and stop
    if (!configLoaded) {
        console.error('❌ No configuration found');
        showStatus('⚠️ Configuration not found. Please set up environment variables in Netlify.', 'error');
        return;
    }

    hideElement(document.getElementById('configNotice'));

    // Set up event listeners
    setupEventListeners();

    // Auto-load trait layers from public folder
    await loadTraitLayersFromPublic();

    // Check for Phantom
    if (window.solana && window.solana.isPhantom) {
        console.log('✅ Phantom wallet detected');
    } else {
        showStatus('⚠️ Phantom wallet not detected. Please install from phantom.app', 'error');
    }
}

// Set up all event listeners
function setupEventListeners() {
    document.getElementById('connectBtn').addEventListener('click', connectWallet);
    document.getElementById('disconnectBtn').addEventListener('click', disconnectWallet);
    document.getElementById('refreshBtn').addEventListener('click', () => fetchUserNFTs(state.walletAddress));
    document.getElementById('backToSelectionBtn').addEventListener('click', backToSelection);
    document.getElementById('previewCustomizeBtn').addEventListener('click', previewCustomization);
    document.getElementById('confirmCustomizeBtn').addEventListener('click', confirmCustomization);

    // Mode selection listeners
    document.getElementById('playgroundModeBtn').addEventListener('click', () => selectMode('playground'));
    document.getElementById('swapModeBtn').addEventListener('click', () => selectMode('swap'));
    document.getElementById('backToWalletBtn').addEventListener('click', backToModeSelection);

    // Swap flow listeners
    document.getElementById('swapBackBtn').addEventListener('click', handleSwapBack);
    document.getElementById('swapNextBtn').addEventListener('click', handleSwapNext);
}

// Show configuration help
window.showConfigHelp = function() {
    alert(`📝 Configuration Instructions:

1. Create a file called "config.json" in this folder
2. Copy this template and fill in your details:

{
  "heliusApiKey": "YOUR_HELIUS_API_KEY",
  "collectionAddress": "YOUR_COLLECTION_ADDRESS",
  "updateAuthority": "YOUR_UPDATE_AUTHORITY_WALLET",
  "updateAuthorityPrivateKey": [YOUR,PRIVATE,KEY,ARRAY],
  "rpcEndpoint": "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
  "layerOrder": ["background", "body", "shirt", ...],
  "optionalLayers": ["face", "eyewear", ...],
  "imageSize": 1750
}

3. Save the file and refresh this page`);
};

// Utility functions
function showElement(el) { if (el) el.classList.remove('hidden'); }
function hideElement(el) { if (el) el.classList.add('hidden'); }

function showStatus(msg, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = msg;
    status.className = type === 'error' ? 'text-red-300 text-sm mt-4' : 'text-green-300 text-sm mt-4';
}

function showLoading(text, subtext = '') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingSubtext').textContent = subtext;
    showElement(document.getElementById('loading'));
    hideElement(document.getElementById('content'));
}

function hideLoading() {
    hideElement(document.getElementById('loading'));
    showElement(document.getElementById('content'));
}

function showProgressModal(steps) {
    const modal = document.getElementById('progressModal');
    const stepsContainer = document.getElementById('progressSteps');
    stepsContainer.innerHTML = steps.map(step => 
        `<div class="flex items-center gap-3">
            <div class="w-4 h-4 border-2 border-white rounded-full"></div>
            <span>${step}</span>
        </div>`
    ).join('');
    showElement(modal);
}

function hideProgressModal() {
    hideElement(document.getElementById('progressModal'));
}

// Removed toggleUploadPanel - upload functionality removed

// Wallet connection
async function connectWallet() {
    console.log('🔌 Connecting wallet...');
    
    try {
        if (!window.solana || !window.solana.isPhantom) {
            alert('Phantom wallet not detected!\n\nPlease:\n1. Install Phantom from phantom.app\n2. Refresh this page\n3. Try again');
            return;
        }
        
        showStatus('Connecting to Phantom...', 'info');
        
        const resp = await window.solana.connect();
        state.walletAddress = resp.publicKey.toString();
        
        console.log('✅ Wallet connected:', state.walletAddress);
        
        document.getElementById('walletAddress').textContent = 
            state.walletAddress.slice(0, 4) + '...' + state.walletAddress.slice(-4);
        
        hideElement(document.getElementById('connectSection'));
        showElement(document.getElementById('walletInfo'));

        showStatus('Connected! Fetching your Trap Stars...', 'info');
        await fetchUserNFTs(state.walletAddress);

        // Show mode selection after fetching NFTs
        showModeSelection();

    } catch (err) {
        console.error('❌ Connection error:', err);
        showStatus('Failed to connect: ' + err.message, 'error');
    }
}

async function disconnectWallet() {
    await window.solana.disconnect();
    state.walletAddress = null;
    state.nfts = [];
    state.mode = null;
    state.swap = {
        step: 1,
        donorNFT: null,
        recipientNFT: null,
        selectedTrait: null,
        transactionSignatures: {}
    };
    showElement(document.getElementById('connectSection'));
    hideElement(document.getElementById('walletInfo'));
    hideElement(document.getElementById('modeSelection'));
    hideElement(document.getElementById('content'));
    hideElement(document.getElementById('customizePage'));
    hideElement(document.getElementById('swapPage'));
    showStatus('Disconnected', 'info');
}

// Show mode selection screen
function showModeSelection() {
    const nftCount = state.nfts.length;
    const swapBtn = document.getElementById('swapModeBtn');
    const swapCard = document.getElementById('swapModeCard');
    const nftReq = document.getElementById('nftRequirement');

    // Require at least 2 NFTs for burn-and-swap
    if (nftCount >= 2) {
        swapBtn.disabled = false;
        swapBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        swapCard.classList.remove('opacity-50');
        nftReq.textContent = `${nftCount} Trap Stars found - Ready to swap!`;
        nftReq.classList.remove('text-red-400', 'text-yellow-400');
        nftReq.classList.add('text-green-400');
    } else if (nftCount === 1) {
        swapBtn.disabled = true;
        swapBtn.classList.add('opacity-50', 'cursor-not-allowed');
        swapCard.classList.add('opacity-50');
        nftReq.textContent = 'Need at least 2 Trap Stars (1 to burn, 1 to upgrade)';
        nftReq.classList.remove('text-green-400', 'text-red-400');
        nftReq.classList.add('text-yellow-400');
    } else {
        swapBtn.disabled = true;
        swapBtn.classList.add('opacity-50', 'cursor-not-allowed');
        swapCard.classList.add('opacity-50');
        nftReq.textContent = 'No Trap Stars found in wallet';
        nftReq.classList.remove('text-green-400', 'text-yellow-400');
        nftReq.classList.add('text-red-400');
    }

    hideElement(document.getElementById('content'));
    hideElement(document.getElementById('customizePage'));
    hideElement(document.getElementById('swapPage'));
    showElement(document.getElementById('modeSelection'));
    showStatus('Choose your mode', 'info');
}

// Select a mode (playground or swap)
async function selectMode(mode) {
    console.log('Mode selected:', mode);
    state.mode = mode;

    if (mode === 'playground') {
        await enterPlaygroundMode();
    } else if (mode === 'swap') {
        if (state.nfts.length < 2) {
            alert('You need at least 2 Trap Stars to use burn & swap mode.');
            return;
        }
        hideElement(document.getElementById('modeSelection'));
        showElement(document.getElementById('swapPage'));
        renderSwapStep();
        showStatus('Burn & Swap: Step 1 of 4', 'info');
    }
}

// Enter playground mode with random traits
async function enterPlaygroundMode() {
    // Generate random attributes
    const attributes = getRandomTraits();

    // Generate initial image for the playground NFT
    showLoading('Generating playground Trap Star...', '');

    try {
        const imageBlob = await generateImageFromTraits(attributes);
        const imageUrl = URL.createObjectURL(imageBlob);

        const defaultNFT = {
            id: 'playground',
            name: 'Playground Trap Star',
            image: imageUrl,
            attributes: attributes
        };

        state.selectedNFT = defaultNFT;

        hideLoading();
        hideElement(document.getElementById('modeSelection'));
        showElement(document.getElementById('customizePage'));
        renderCustomizationPage();
        showStatus('Playground Mode - Experiment freely!', 'info');
    } catch (error) {
        hideLoading();
        console.error('Failed to generate playground NFT:', error);
        showStatus('Failed to generate playground NFT', 'error');
    }
}

// Get random traits for playground
function getRandomTraits() {
    const attributes = [];

    // Use the layer order from config to ensure proper layering
    for (const layerName of config.layerOrder) {
        const traits = state.traitLayers[layerName];
        if (traits && traits.length > 0) {
            const randomIndex = Math.floor(Math.random() * traits.length);
            const selectedTrait = traits[randomIndex];

            attributes.push({
                trait_type: layerName,
                value: selectedTrait.name
            });
        }
    }

    return attributes;
}

// Back to mode selection
function backToModeSelection() {
    state.mode = null;
    state.selectedNFT = null;
    state.customTraits = {};
    state.previewImage = null;
    state.swap = {
        step: 1,
        donorNFT: null,
        recipientNFT: null,
        selectedTrait: null,
        transactionSignatures: {}
    };
    hideElement(document.getElementById('content'));
    hideElement(document.getElementById('customizePage'));
    hideElement(document.getElementById('swapPage'));
    showModeSelection();
}

// Fetch user's NFTs using Helius DAS API
async function fetchUserNFTs(walletAddr) {
    showLoading('Fetching your Trap Stars from Helius...', 'This may take a moment');
    
    try {
        console.log('📡 Fetching NFTs for:', walletAddr);
        console.log('🔗 Using RPC:', config.rpcEndpoint);
        
        const response = await fetch(config.rpcEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'trap-stars',
                method: 'getAssetsByOwner',
                params: {
                    ownerAddress: walletAddr,
                    page: 1,
                    limit: 1000
                }
            })
        });
        
        const data = await response.json();
        console.log('📦 Helius response:', data);
        
        if (data.error) {
            throw new Error(`Helius API error: ${data.error.message}`);
        }
        
        if (!data.result || !data.result.items) {
            throw new Error('Unexpected response from Helius API');
        }
        
        console.log(`📊 Total assets found: ${data.result.items.length}`);
        
        // Filter for Trap Stars collection
        const trapStars = data.result.items.filter(item => {
            const hasCollection = item.grouping?.some(g => 
                g.group_key === 'collection' && 
                g.group_value === config.collectionAddress
            );
            return hasCollection;
        });
        
        console.log(`⭐ Trap Stars found: ${trapStars.length}`);
        
        if (trapStars.length === 0) {
            hideLoading();
            document.getElementById('content').innerHTML = `
                <div class="text-center py-20">
                    <p class="text-xl mb-4">No Trap Stars found in your wallet</p>
                    <p class="text-purple-300 mb-2">Total assets checked: ${data.result.items.length}</p>
                    <p class="text-sm text-gray-400">Collection: ${config.collectionAddress}</p>
                </div>
            `;
            showStatus(`No Trap Stars found (checked ${data.result.items.length} assets)`, 'error');
            return;
        }
        
        // Format NFTs
        state.nfts = trapStars.map(nft => ({
            mint: nft.id,
            name: nft.content?.metadata?.name || 'Trap Star',
            image: nft.content?.links?.image || nft.content?.files?.[0]?.uri || 'https://via.placeholder.com/300/6B46C1/fff?text=TrapStar',
            attributes: nft.content?.metadata?.attributes || [],
            compressed: nft.compression?.compressed || false,
            rawData: nft
        }));
        
        console.log('✅ Formatted NFTs:', state.nfts);
        
        document.getElementById('nftCount').textContent = `${state.nfts.length} Trap Stars found`;
        
        hideLoading();
        renderNFTSelection();
        showStatus(`✅ Found ${state.nfts.length} Trap Stars!`, 'info');
        
    } catch (err) {
        console.error('❌ Fetch error:', err);
        hideLoading();
        showStatus('Error fetching NFTs: ' + err.message, 'error');
        alert(`Failed to fetch NFTs:\n\n${err.message}\n\nCheck the browser console for details.`);
    }
}

// Auto-load trait layers from public folder
async function loadTraitLayersFromPublic() {
    console.log('📁 Loading trait layers from public folder...');

    try {
        const manifestResponse = await fetch('/manifest.json');

        if (!manifestResponse.ok) {
            console.warn('⚠️ Trait manifest not found. Run generate-manifest.js to create it.');
            showStatus('⚠️ Trait manifest not found.', 'info');
            return;
        }

        const manifest = await manifestResponse.json();
        console.log('✅ Trait manifest loaded:', manifest);

        const layersByCategory = {};
        let loadedTraits = 0;

        for (const [category, traitNames] of Object.entries(manifest)) {
            if (!Array.isArray(traitNames)) continue;

            layersByCategory[category] = [];

            for (const traitName of traitNames) {
                // Use GitHub raw URLs for all trait images (backgrounds use Cloudinary via getBackgroundUrl)
                const imagePath = category.toLowerCase() === 'background'
                    ? `/${category}/${traitName}.png`
                    : getTraitImageUrl(category, traitName);

                layersByCategory[category].push({
                    name: traitName,
                    url: imagePath,
                    loaded: true
                });
                loadedTraits++;
            }
        }

        state.traitLayers = layersByCategory;

        const categories = Object.keys(layersByCategory).filter(cat => layersByCategory[cat].length > 0);

        console.log(`✅ Loaded ${loadedTraits} traits across ${categories.length} categories`);

        if (loadedTraits > 0) {
            showStatus(`✅ Auto-loaded ${loadedTraits} trait images from ${categories.length} categories!`, 'info');

            const categoriesHTML = categories.map(cat =>
                `<span class="inline-block bg-green-600 px-3 py-1 rounded-full text-sm mr-2 mb-2">${cat} (${layersByCategory[cat].length})</span>`
            ).join('');

            const loadedInfo = document.getElementById('loadedCategories');
            if (loadedInfo) {
                loadedInfo.innerHTML = `
                    <div class="mt-4">
                        <p class="font-bold mb-2 text-green-300">✅ Auto-loaded Trait Categories:</p>
                        <div>${categoriesHTML}</div>
                    </div>
                `;
            }
        } else {
            showStatus('⚠️ No trait images found.', 'info');
        }

    } catch (err) {
        console.error('❌ Failed to load trait layers:', err);
        showStatus('⚠️ Could not auto-load traits.', 'info');
    }
}

// Render NFT selection
function renderNFTSelection() {
    const html = `
        <div class="fade-in">
            <h2 class="section-title text-center mb-12">Select Your Trap Star</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${state.nfts.map((nft, idx) => `
                    <div onclick="selectNFTToCustomize(${idx})" class="nft-card glass rounded-2xl p-5 cursor-pointer transition-all">
                        <div class="relative overflow-hidden rounded-xl mb-4">
                            <img src="${nft.image}" alt="${nft.name}" class="w-full aspect-square object-cover">
                        </div>
                        <h3 class="font-semibold mb-3 text-lg tracking-tight">${nft.name}</h3>
                        <div class="space-y-2 text-sm">
                            ${nft.attributes.slice(0, 3).map(attr => `
                                <div class="flex justify-between items-center text-gray-300">
                                    <span class="capitalize text-gray-400">${attr.trait_type}:</span>
                                    <span class="font-medium">${attr.value}</span>
                                </div>
                            `).join('')}
                            ${nft.attributes.length > 3 ? `<p class="text-xs text-gray-500 mt-3 pt-2 border-t border-white/5">+${nft.attributes.length - 3} more traits</p>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    document.getElementById('content').innerHTML = html;
}

// Selection function - opens customization page
window.selectNFTToCustomize = (idx) => {
    state.selectedNFT = state.nfts[idx];
    state.customTraits = {}; // Reset custom traits
    state.previewImage = null; // Reset preview
    console.log('Selected NFT to customize:', state.selectedNFT);
    openCustomizePage();
};

// Open customization page (full page, not modal)
function openCustomizePage() {
    if (!state.selectedNFT) return;
    
    // Hide NFT selection, show customization page
    hideElement(document.getElementById('content'));
    showElement(document.getElementById('customizePage'));
    
    const nftDisplay = document.getElementById('nftDisplay');
    const traitSelectors = document.getElementById('traitSelectors');
    
    // Display NFT info
    nftDisplay.innerHTML = `
        <h3 class="text-2xl font-semibold mb-4">${state.selectedNFT.name}</h3>
        <img src="${state.selectedNFT.image}" alt="${state.selectedNFT.name}" class="w-full max-w-md mx-auto rounded-lg shadow-lg mb-4">
        <div class="text-sm text-purple-200 space-y-1">
            ${state.selectedNFT.attributes.slice(0, 5).map(attr => `
                <div class="flex justify-between">
                    <span class="capitalize">${attr.trait_type}:</span>
                    <span class="font-semibold">${attr.value}</span>
                </div>
            `).join('')}
        </div>
    `;
    
    // Build trait selection dropdowns based on layer order (exclude logo)
    const traitHTML = config.layerOrder
        .filter(layerName => layerName.toLowerCase() !== 'logo')
        .map(layerName => {
        // Find current trait value for this layer
        const currentTrait = state.selectedNFT.attributes.find(attr =>
            attr.trait_type.toLowerCase() === layerName.toLowerCase()
        );
        const currentValue = currentTrait ? currentTrait.value : '';

        // Get available options for this layer
        const availableTraits = state.traitLayers[layerName] || [];
        const options = availableTraits.map(trait => {
            const selected = trait.name === currentValue ? 'selected' : '';
            return `<option value="${trait.name}" ${selected}>${trait.name}</option>`;
        }).join('');

        // Add "None" option for optional layers
        const noneOption = config.optionalLayers.includes(layerName)
            ? '<option value="">None</option>'
            : '';

        return `
            <div class="trait-row">
                <label class="trait-label">
                    ${layerName}
                </label>
                <select
                    class="trait-select w-full"
                    data-trait-type="${layerName}"
                    onchange="updateCustomTrait('${layerName}', this.value)"
                >
                    ${noneOption}
                    ${options}
                </select>
                <span class="trait-current" title="${currentValue || 'None'}">
                    ${currentValue || '—'}
                </span>
            </div>
        `;
    }).join('');
    
    traitSelectors.innerHTML = traitHTML;
    
    // Reset preview and confirm button
    hideElement(document.getElementById('previewDisplay'));
    const confirmBtn = document.getElementById('confirmCustomizeBtn');
    confirmBtn.disabled = true;
    confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
    confirmBtn.classList.remove('opacity-100');
}

// Update custom trait selection
window.updateCustomTrait = (traitType, value) => {
    if (value === '') {
        delete state.customTraits[traitType];
    } else {
        state.customTraits[traitType] = value;
    }
    console.log('Updated custom traits:', state.customTraits);
    
    // Disable confirm button when traits change (need to preview again)
    const confirmBtn = document.getElementById('confirmCustomizeBtn');
    if (confirmBtn && !confirmBtn.disabled) {
        confirmBtn.disabled = true;
        confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
        confirmBtn.classList.remove('opacity-100');
        // Hide old preview since traits changed
        hideElement(document.getElementById('previewDisplay'));
        if (state.previewImage) {
            URL.revokeObjectURL(state.previewImage);
            state.previewImage = null;
        }
    }
};

// Back to selection
function backToSelection() {
    hideElement(document.getElementById('customizePage'));
    showElement(document.getElementById('content'));
    state.customTraits = {};
    state.previewImage = null;
    state.selectedNFT = null;
    renderNFTSelection();
}

// Preview customization
async function previewCustomization() {
    if (!state.selectedNFT) {
        alert('No NFT selected!');
        return;
    }

    try {
        console.log('Starting preview generation...');
        showStatus('Generating preview...', 'info');

        // Generate image with custom traits
        const previewBlob = await generateCustomImage();

        if (!previewBlob) {
            throw new Error('Failed to generate preview blob');
        }

        // Clean up old preview URL if exists
        if (state.previewImage) {
            URL.revokeObjectURL(state.previewImage);
        }

        const previewUrl = URL.createObjectURL(previewBlob);
        state.previewImage = previewUrl;

        console.log('Preview URL created:', previewUrl);

        // Show preview
        const previewDisplay = document.getElementById('previewDisplay');
        const previewImage = document.getElementById('previewImage');

        if (!previewDisplay || !previewImage) {
            throw new Error('Preview display elements not found in DOM');
        }

        previewImage.src = previewUrl;
        showElement(previewDisplay);

        // Enable confirm button
        const confirmBtn = document.getElementById('confirmCustomizeBtn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            confirmBtn.classList.add('opacity-100');
        }

        showStatus('✅ Preview generated! You can preview again after making changes.', 'info');
    } catch (err) {
        console.error('Preview error:', err);
        console.error('Error stack:', err.stack);
        const errorMsg = err.message || 'Unknown error occurred';
        showStatus('Error generating preview: ' + errorMsg, 'error');
        alert('Error generating preview:\n\n' + errorMsg + '\n\nCheck the browser console (F12) for detailed logs.');
    }
}

// Generate image with custom traits
async function generateCustomImage() {
    if (!state.selectedNFT || !state.selectedNFT.attributes) {
        throw new Error('No NFT selected or NFT has no attributes!');
    }

    const updatedAttributes = state.selectedNFT.attributes.map(attr => {
        const customValue = state.customTraits[attr.trait_type.toLowerCase()];
        if (customValue !== undefined) {
            return { ...attr, value: customValue };
        }
        return attr;
    });

    for (const [traitType, value] of Object.entries(state.customTraits)) {
        if (!updatedAttributes.find(a => a.trait_type.toLowerCase() === traitType.toLowerCase())) {
            updatedAttributes.push({ trait_type: traitType, value: value });
        }
    }

    return generateImageFromTraits(updatedAttributes);
}

// Confirm and execute customization
async function confirmCustomization() {
    if (!state.previewImage) {
        alert('Please preview your changes first!');
        return;
    }
    
    const confirmed = confirm(
        `⚠️ Confirm Customization ⚠️\n\n` +
        `This will update: ${state.selectedNFT.name}\n` +
        `With your custom trait selections.\n\n` +
        `This action will cost SOL for:\n` +
        `- Arweave uploads (~0.01 SOL)\n` +
        `- Transaction fees (~0.001 SOL)\n\n` +
        `Continue?`
    );
    
    if (!confirmed) return;
    
    // TODO: Implement blockchain update
    alert('Blockchain update functionality coming soon!');
    backToSelection();
}

// Generate new image with trait swapped
async function regenerateImage() {
    console.log('🎨 Regenerating image...');
    
    // Validate trait layers are loaded
    if (!state.traitLayers || Object.keys(state.traitLayers).length === 0) {
        throw new Error('Trait layers not loaded! Traits should auto-load from the public folder. If they didn\'t load, check that:\n1. public/traits/manifest.json exists\n2. Trait image files are in the correct folders\n3. Or use "Upload Custom Traits" button as fallback.');
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = config.imageSize;
    canvas.height = config.imageSize;
    const ctx = canvas.getContext('2d');
    
    const updatedAttributes = state.targetNFT.attributes.map(attr => 
        attr.trait_type === state.selectedTrait.trait_type ? state.selectedTrait : attr
    );
    
    console.log('Updated attributes:', updatedAttributes);
    
    const missingFiles = [];
    const missingLayers = [];
    
    for (const layerName of config.layerOrder) {
        const trait = updatedAttributes.find(attr => 
            attr.trait_type.toLowerCase() === layerName.toLowerCase()
        );
        
        if (!trait || !trait.value) {
            if (config.optionalLayers.includes(layerName)) {
                console.log(`Skipping optional layer: ${layerName}`);
                continue;
            } else {
                missingLayers.push(`${layerName} (required but no trait value found)`);
                continue;
            }
        }
        
        const layerFiles = state.traitLayers[layerName];
        if (!layerFiles || layerFiles.length === 0) {
            missingLayers.push(`${layerName} (folder not found in uploaded layers)`);
            continue;
        }
        
        // Try exact match first, then case-insensitive
        let traitFile = layerFiles.find(f => f.name === trait.value);
        if (!traitFile) {
            traitFile = layerFiles.find(f => f.name.toLowerCase() === trait.value.toLowerCase());
        }
        
        if (!traitFile) {
            const availableFiles = layerFiles.map(f => f.name).slice(0, 5).join(', ');
            const moreCount = layerFiles.length > 5 ? ` (+${layerFiles.length - 5} more)` : '';
            missingFiles.push({
                layer: layerName,
                needed: trait.value,
                available: `${availableFiles}${moreCount}`,
                totalAvailable: layerFiles.length
            });
            continue;
        }
        
        console.log(`Drawing layer: ${layerName} - ${trait.value}`);
        
        try {
            await new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, config.imageSize, config.imageSize);
                    resolve();
                };
                img.onerror = () => reject(new Error(`Failed to load image: ${layerName}/${trait.value}`));
                img.src = traitFile.url;
            });
        } catch (err) {
            throw new Error(`Failed to load image file for ${layerName}/${trait.value}: ${err.message}`);
        }
    }
    
    // Report missing files with helpful error messages
    if (missingFiles.length > 0 || missingLayers.length > 0) {
        let errorMsg = '❌ Missing trait files for image generation:\n\n';

        if (missingLayers.length > 0) {
            errorMsg += 'Missing layer folders:\n';
            missingLayers.forEach(layer => {
                errorMsg += `  - ${layer}\n`;
            });
            errorMsg += '\n';
        }

        if (missingFiles.length > 0) {
            errorMsg += 'Missing trait files (file name must match trait value exactly):\n';
            missingFiles.forEach(({ layer, needed, available, totalAvailable }) => {
                errorMsg += `  - ${layer}/${needed}.png\n`;
                errorMsg += `    Available files in ${layer}: ${available}\n`;
                errorMsg += `    (Total: ${totalAvailable} files)\n\n`;
            });
            errorMsg += '\n💡 Tip: Make sure your trait file names match the trait values exactly (case-sensitive).\n';
            errorMsg += '   For example, if trait value is "Red Shirt", the file should be named "Red Shirt.png"';
        }

        throw new Error(errorMsg);
    }

    const logoUrl = import.meta.env.VITE_LOGO_URL || 'https://trapstars-assets.netlify.app/logo/logo.png';
    console.log(`Drawing logo overlay from: ${logoUrl}`);

    try {
        await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                ctx.drawImage(img, 0, 0, config.imageSize, config.imageSize);
                console.log('✅ Logo overlay drawn');
                resolve();
            };
            img.onerror = (e) => {
                console.warn('Logo failed to load, continuing without it');
                resolve();
            };
            img.src = logoUrl;
        });
    } catch (err) {
        console.warn('Error loading logo, continuing without it:', err.message);
    }

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Failed to generate image blob'));
                return;
            }
            console.log('✅ Image generated:', blob);
            resolve(blob);
        }, 'image/png');
    });
}

// Swap step rendering and navigation
function renderSwapStep() {
    window.renderSwapStep(state, config);
}

function handleSwapBack() {
    if (state.swap.step === 1) {
        // Cancel and go back to mode selection
        backToModeSelection();
    } else {
        // Go to previous step
        state.swap.step--;
        renderSwapStep();
        showStatus(`Burn & Swap: Step ${state.swap.step} of 4`, 'info');
    }
}

async function handleSwapNext() {
    if (state.swap.step === 4) {
        // Execute the burn and swap
        await executeSwap();
    } else {
        // Go to next step
        state.swap.step++;
        renderSwapStep();
        showStatus(`Burn & Swap: Step ${state.swap.step} of 4`, 'info');
    }
}

// Execute the swap transaction
async function executeSwap() {
    try {
        const { executeBurnAndSwap } = await import('./swap.js');

        // Show progress during execution
        showLoading('Executing burn and swap...', 'Please wait, do not close this page');

        const result = await executeBurnAndSwap(
            state,
            config,
            generateImageFromTraits,
            (msg, submsg) => {
                document.getElementById('loadingText').textContent = msg;
                document.getElementById('loadingSubtext').textContent = submsg;
            },
            window.walletAdapter
        );

        hideLoading();

        // Show success
        showSwapSuccess(result);

        // Refresh NFTs
        await fetchUserNFTs(state.walletAddress);

    } catch (error) {
        hideLoading();
        console.error('Swap failed:', error);
        alert(`Swap failed: ${error.message}\n\nPlease check the console for details.`);
    }
}

// Show swap success screen
function showSwapSuccess(result) {
    hideElement(document.getElementById('swapPage'));

    const successHTML = `
        <div class="max-w-4xl mx-auto text-center fade-in">
            <div class="text-6xl mb-6">✅</div>
            <h2 class="text-4xl font-light mb-4">Swap Successful!</h2>
            <p class="text-gray-400 mb-8">Your Trap Star has been upgraded with the new trait</p>

            <div class="glass rounded-2xl p-8 mb-6">
                <h3 class="text-xl font-semibold mb-4">Transaction Details</h3>
                <div class="space-y-3 text-left">
                    <div>
                        <p class="text-xs text-gray-400 mb-1">Service Fee Payment</p>
                        <a href="https://solscan.io/tx/${result.serviceFeeSignature}" target="_blank"
                           class="font-mono text-sm text-blue-400 hover:text-blue-300 break-all">
                            ${result.serviceFeeSignature}
                        </a>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400 mb-1">Cost Reimbursement</p>
                        <a href="https://solscan.io/tx/${result.reimbursementSignature}" target="_blank"
                           class="font-mono text-sm text-blue-400 hover:text-blue-300 break-all">
                            ${result.reimbursementSignature}
                        </a>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400 mb-1">Burn Signature</p>
                        <a href="https://solscan.io/tx/${result.burnSignature}" target="_blank"
                           class="font-mono text-sm text-blue-400 hover:text-blue-300 break-all">
                            ${result.burnSignature}
                        </a>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400 mb-1">Update Signature</p>
                        <a href="https://solscan.io/tx/${result.updateSignature}" target="_blank"
                           class="font-mono text-sm text-blue-400 hover:text-blue-300 break-all">
                            ${result.updateSignature}
                        </a>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400 mb-1">New Image</p>
                        <a href="${result.imageUrl}" target="_blank"
                           class="font-mono text-sm text-blue-400 hover:text-blue-300 break-all">
                            ${result.imageUrl}
                        </a>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400 mb-1">New Metadata</p>
                        <a href="${result.metadataUrl}" target="_blank"
                           class="font-mono text-sm text-blue-400 hover:text-blue-300 break-all">
                            ${result.metadataUrl}
                        </a>
                    </div>
                </div>
            </div>

            <div class="flex gap-4 justify-center">
                <button onclick="showModeSelection()" class="btn-primary px-8 py-3 rounded-xl">
                    Perform Another Swap
                </button>
                <button onclick="location.reload()" class="btn-secondary px-8 py-3 rounded-xl">
                    View Collection
                </button>
            </div>
        </div>
    `;

    document.getElementById('content').innerHTML = successHTML;
    showElement(document.getElementById('content'));
    showStatus('✅ Swap completed successfully!', 'info');
}

// Wrapper function for renderCustomizationPage
function renderCustomizationPage() {
    openCustomizePage();
}

// Generate image from traits (used for both customization and swap preview)
async function generateImageFromTraits(attributes) {
    console.log('🎨 Starting image generation from traits...');

    if (!config) {
        throw new Error('Configuration not loaded!');
    }

    if (!config.layerOrder || !Array.isArray(config.layerOrder)) {
        throw new Error('Layer order not defined in config!');
    }

    if (!state.traitLayers || Object.keys(state.traitLayers).length === 0) {
        throw new Error('Trait layers not loaded! Please wait for traits to load or refresh the page.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = config.imageSize;
    canvas.height = config.imageSize;
    const ctx = canvas.getContext('2d');

    console.log('Canvas created:', canvas.width, 'x', canvas.height);
    console.log('Generating image with attributes:', attributes);

    let layersDrawn = 0;
    const missingLayers = [];

    for (const layerName of config.layerOrder) {
        const trait = attributes.find(attr =>
            attr.trait_type.toLowerCase() === layerName.toLowerCase()
        );

        if (!trait || !trait.value || trait.value === '') {
            if (config.optionalLayers.includes(layerName)) {
                console.log(`Skipping optional layer: ${layerName}`);
                continue;
            }
            console.log(`No trait value for required layer: ${layerName}`);
            continue;
        }

        if (layerName.toLowerCase() === 'background') {
            const backgroundUrl = getBackgroundUrl(trait.value);

            if (!backgroundUrl) {
                console.warn(`Background URL not found for: ${trait.value}`);
                if (config.optionalLayers.includes(layerName)) {
                    continue;
                }
                missingLayers.push(`${layerName}/${trait.value} (no URL mapping)`);
                continue;
            }

            console.log(`Drawing background: ${trait.value} from ${backgroundUrl}`);

            try {
                await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        ctx.drawImage(img, 0, 0, config.imageSize, config.imageSize);
                        layersDrawn++;
                        resolve();
                    };
                    img.onerror = (e) => {
                        reject(new Error(`Failed to load background: ${backgroundUrl}`));
                    };
                    img.src = backgroundUrl;
                });
            } catch (err) {
                throw new Error(`Error loading background ${trait.value}: ${err.message}`);
            }
            continue;
        }

        const layerFiles = state.traitLayers[layerName];
        if (!layerFiles || layerFiles.length === 0) {
            missingLayers.push(`${layerName} (no files loaded)`);
            console.warn(`No files loaded for layer: ${layerName}`);
            continue;
        }

        let traitFile = layerFiles.find(f => f.name === trait.value);
        if (!traitFile) {
            traitFile = layerFiles.find(f => f.name.toLowerCase() === trait.value.toLowerCase());
        }

        if (!traitFile) {
            const available = layerFiles.map(f => f.name).slice(0, 5).join(', ');
            missingLayers.push(`${layerName}/${trait.value} (available: ${available}...)`);
            console.warn(`Trait not found: ${layerName}/${trait.value}`);
            continue;
        }

        console.log(`Drawing layer: ${layerName} - ${trait.value} from ${traitFile.url}`);

        try {
            await new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, config.imageSize, config.imageSize);
                    layersDrawn++;
                    resolve();
                };
                img.onerror = (e) => {
                    reject(new Error(`Failed to load image: ${traitFile.url}`));
                };
                img.src = traitFile.url;
            });
        } catch (err) {
            throw new Error(`Error loading ${layerName}/${trait.value}: ${err.message}`);
        }
    }

    console.log(`✅ Drew ${layersDrawn} layers`);

    if (layersDrawn === 0) {
        throw new Error('No layers were drawn! This may indicate a trait matching issue.');
    }

    if (missingLayers.length > 0) {
        console.warn('Missing layers:', missingLayers);
    }

    const logoUrl = import.meta.env.VITE_LOGO_URL || 'https://trapstars-assets.netlify.app/logo/logo.png';
    console.log(`Drawing logo overlay from: ${logoUrl}`);

    try {
        await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                ctx.drawImage(img, 0, 0, config.imageSize, config.imageSize);
                console.log('✅ Logo overlay drawn');
                resolve();
            };
            img.onerror = (e) => {
                console.warn('Logo failed to load, continuing without it');
                resolve();
            };
            img.src = logoUrl;
        });
    } catch (err) {
        console.warn('Error loading logo, continuing without it:', err.message);
    }

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Failed to generate image blob from canvas'));
            } else {
                console.log('✅ Image blob generated:', blob.size, 'bytes');
                resolve(blob);
            }
        }, 'image/png');
    });
}

// Expose state and config globally for swap-ui
window.appState = state;
window.appConfig = config;
window.showModeSelection = showModeSelection;
window.generateImageFromTraits = generateImageFromTraits;

// OLD SWAP FUNCTION REMOVED - replaced with customization flow above

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}