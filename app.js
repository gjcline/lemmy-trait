// Trap Stars Trait Shop - Production App
// This file handles all wallet connections, NFT fetching, image generation, and blockchain transactions

import { Buffer } from 'buffer';
import process from 'process';
import bs58 from 'bs58';

window.Buffer = Buffer;
window.process = process;
window.global = window;

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

    // Try environment variables (production)
    if (import.meta.env.VITE_HELIUS_API_KEY) {
        try {
            // Construct RPC endpoint from Helius API key
            const heliusApiKey = import.meta.env.VITE_HELIUS_API_KEY;
            const rpcEndpoint = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;

            config = {
                heliusApiKey: heliusApiKey,
                collectionAddress: import.meta.env.VITE_COLLECTION_ADDRESS,
                updateAuthority: import.meta.env.VITE_UPDATE_AUTHORITY,
                reimbursementWallet: import.meta.env.VITE_REIMBURSEMENT_WALLET || import.meta.env.VITE_UPDATE_AUTHORITY,
                collectionWallet: import.meta.env.VITE_COLLECTION_WALLET || import.meta.env.VITE_FEE_RECIPIENT_WALLET,
                rpcEndpoint: rpcEndpoint,
                layerOrder: JSON.parse(import.meta.env.VITE_LAYER_ORDER || '["background","body","shirt","face","mouth","eyes","eyebrows","hair","iceout chain","accessories","eyewear","meme","headwear","weapons"]'),
                optionalLayers: JSON.parse(import.meta.env.VITE_OPTIONAL_LAYERS || '["background","face","eyewear","headwear","accessories","weapons","iceout chain","meme"]'),
                imageSize: parseInt(import.meta.env.VITE_IMAGE_SIZE || '1750'),
                feeRecipientWallet: import.meta.env.VITE_FEE_RECIPIENT_WALLET,
                serviceFeeSOL: import.meta.env.VITE_SERVICE_FEE_SOL || '0.025',
                reimbursementSOL: import.meta.env.VITE_REIMBURSEMENT_SOL || '0.015',
                supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
                supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
            };
            console.log('✅ Configuration loaded from environment variables');
            console.log('🔗 RPC Endpoint:', rpcEndpoint);
            console.log('📋 Collection Address:', config.collectionAddress);
            console.log('📋 Layer order:', config.layerOrder);
            console.log('📋 Optional layers:', config.optionalLayers);

            // Log which values are using fallbacks
            if (!import.meta.env.VITE_LAYER_ORDER) console.warn('⚠️ Using fallback layer order');
            if (!import.meta.env.VITE_OPTIONAL_LAYERS) console.warn('⚠️ Using fallback optional layers');
            if (!import.meta.env.VITE_IMAGE_SIZE) console.warn('⚠️ Using fallback image size');
            if (!import.meta.env.VITE_SERVICE_FEE_SOL) console.warn('⚠️ Using fallback service fee');
            if (!import.meta.env.VITE_REIMBURSEMENT_SOL) console.warn('⚠️ Using fallback reimbursement');

            configLoaded = true;
        } catch (err) {
            console.error('❌ Error parsing environment variables:', err);
        }
    } else {
        console.error('❌ VITE_HELIUS_API_KEY not found in environment variables');
        console.log('💡 Available env vars:', Object.keys(import.meta.env));
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

This app requires environment variables to be configured in your Netlify dashboard.

Required Environment Variables:
- VITE_HELIUS_API_KEY
- VITE_COLLECTION_ADDRESS
- VITE_UPDATE_AUTHORITY (public address only)
- VITE_RPC_ENDPOINT
- VITE_LAYER_ORDER
- VITE_OPTIONAL_LAYERS
- VITE_IMAGE_SIZE
- VITE_FEE_RECIPIENT_WALLET
- VITE_SERVICE_FEE_SOL
- VITE_REIMBURSEMENT_SOL
- VITE_SUPABASE_URL (for Edge Functions)
- VITE_SUPABASE_ANON_KEY (for Edge Functions)

⚠️ SECURITY NOTICE:
- Private keys are NEVER stored in frontend environment variables
- Update authority private key is stored in Supabase Edge Function secrets
- Only use VITE_ prefix for public, non-sensitive data`);
};

// Utility functions
function showElement(el) { if (el) el.classList.remove('hidden'); }
function hideElement(el) { if (el) el.classList.add('hidden'); }

function showStatus(msg, type = 'info') {
    const status = document.getElementById('status');
    if (!status) return;
    status.textContent = msg;

    const badge = status.parentElement;
    if (badge) {
        if (type === 'error') {
            badge.classList.remove('text-green-400/90', 'border-white/10');
            badge.classList.add('text-red-400/90', 'border-red-500/20');
        } else {
            badge.classList.remove('text-red-400/90', 'border-red-500/20');
            badge.classList.add('text-green-400/90', 'border-white/10');
        }
    }
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

function showFullPageLoading(title, subtext = '') {
    document.getElementById('fullPageLoadingTitle').textContent = title;
    document.getElementById('fullPageLoadingSubtext').textContent = subtext;
    showElement(document.getElementById('fullPageLoading'));
}

function hideFullPageLoading() {
    hideElement(document.getElementById('fullPageLoading'));
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

        // Store wallet adapter for swap transactions
        window.walletAdapter = window.solana;

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
    window.walletAdapter = null;
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

// Reset swap flow and start fresh
async function resetSwapFlow() {
    // Clear all swap state
    state.swap = {
        step: 1,
        donorNFT: null,
        recipientNFT: null,
        selectedTrait: null,
        transactionSignatures: {},
        compositeImageDataUrl: null,
        useNewLogo: true,
        updatedAttributes: null
    };

    // Refresh NFT list to remove transferred NFT
    showStatus('Refreshing your collection...', 'info');
    await fetchUserNFTs(state.walletAddress);

    // Return to mode selection
    showModeSelection();
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
        hideLoading();
        showStatus(`Found ${trapStars.length} Trap Stars!`, 'success');
        
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
            <div class="flex justify-between items-center mb-12">
                <h2 class="section-title">Select Your Trap Star</h2>
                <button onclick="backToHome()" class="btn-secondary px-6 py-3 rounded-xl">
                    ← Back to Home
                </button>
            </div>
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
            <div class="text-center mt-12">
                <button onclick="backToHome()" class="text-gray-400 hover:text-white transition-colors text-sm">
                    ← Back to Home
                </button>
            </div>
        </div>
    `;

    document.getElementById('content').innerHTML = html;
}

// Selection function - opens customization page
window.selectNFTToCustomize = (idx) => {
    state.selectedNFT = state.nfts[idx];
    state.customTraits = {}; // Reset custom traits
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
}

// Update custom trait selection
window.updateCustomTrait = (traitType, value) => {
    if (value === '') {
        delete state.customTraits[traitType];
    } else {
        state.customTraits[traitType] = value;
    }
    console.log('Updated custom traits:', state.customTraits);
};

// Back to selection
function backToSelection() {
    hideElement(document.getElementById('customizePage'));
    showElement(document.getElementById('content'));
    state.customTraits = {};
    state.selectedNFT = null;
    renderNFTSelection();
}

// Back to home (mode selection)
function backToHome() {
    hideElement(document.getElementById('customizePage'));
    hideElement(document.getElementById('content'));
    hideElement(document.getElementById('swapPage'));
    showElement(document.getElementById('modeSelection'));
    state.customTraits = {};
    state.selectedNFT = null;
    state.mode = null;
    showStatus('Choose your mode', 'info');
}

// Make backToHome globally accessible
window.backToHome = backToHome;

// Preview customization
async function previewCustomization() {
    if (!state.selectedNFT) {
        alert('No NFT selected!');
        return;
    }

    try {
        console.log('Starting preview generation...');
        showStatus('Applying changes...', 'info');

        // Generate updated attributes with custom traits
        const updatedAttributes = state.selectedNFT.attributes.map(attr => {
            const customValue = state.customTraits[attr.trait_type.toLowerCase()];
            if (customValue !== undefined) {
                return { ...attr, value: customValue };
            }
            return attr;
        });

        // Add any new traits that weren't in original attributes
        for (const [traitType, value] of Object.entries(state.customTraits)) {
            if (!updatedAttributes.find(a => a.trait_type.toLowerCase() === traitType.toLowerCase())) {
                updatedAttributes.push({ trait_type: traitType, value: value });
            }
        }

        // Generate image with custom traits
        const previewBlob = await generateImageFromTraits(updatedAttributes);

        if (!previewBlob) {
            throw new Error('Failed to generate preview blob');
        }

        // Clean up old image URL if it's a generated one (not from NFT metadata)
        if (state.selectedNFT.image && state.selectedNFT.image.startsWith('blob:')) {
            URL.revokeObjectURL(state.selectedNFT.image);
        }

        const newImageUrl = URL.createObjectURL(previewBlob);

        console.log('New image URL created:', newImageUrl);

        // Update state with new image and attributes
        state.selectedNFT.image = newImageUrl;
        state.selectedNFT.attributes = updatedAttributes;

        // Update the nftDisplay with new image and traits
        const nftDisplay = document.getElementById('nftDisplay');
        nftDisplay.innerHTML = `
            <h3 class="text-2xl font-semibold mb-4">${state.selectedNFT.name}</h3>
            <img src="${newImageUrl}" alt="${state.selectedNFT.name}" class="w-full max-w-md mx-auto rounded-lg shadow-lg mb-4">
            <div class="text-sm text-purple-200 space-y-1">
                ${updatedAttributes.slice(0, 5).map(attr => `
                    <div class="flex justify-between">
                        <span class="capitalize">${attr.trait_type}:</span>
                        <span class="font-semibold">${attr.value}</span>
                    </div>
                `).join('')}
            </div>
        `;

        showStatus('✅ Changes applied! You can continue customizing.', 'info');
    } catch (err) {
        console.error('Preview error:', err);
        console.error('Error stack:', err.stack);
        const errorMsg = err.message || 'Unknown error occurred';
        showStatus('Error applying changes: ' + errorMsg, 'error');
        alert('Error applying changes:\n\n' + errorMsg + '\n\nCheck the browser console (F12) for detailed logs.');
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

// Generate another random Trap Star
async function confirmCustomization() {
    try {
        // Generate random traits
        const randomTraits = {};

        for (const layer of config.layerOrder) {
            if (state.traitLayers[layer] && state.traitLayers[layer].length > 0) {
                // For optional layers, randomly decide if we want NONE or a real value
                if (config.optionalLayers.includes(layer) && Math.random() < 0.3) {
                    const noneOption = state.traitLayers[layer].find(t => t.name.toUpperCase() === 'NONE');
                    if (noneOption) {
                        randomTraits[layer] = noneOption.name;
                        continue;
                    }
                }

                // Pick a random trait
                const randomIndex = Math.floor(Math.random() * state.traitLayers[layer].length);
                randomTraits[layer] = state.traitLayers[layer][randomIndex].name;
            }
        }

        // Update state
        state.customTraits = randomTraits;

        // Update all dropdowns
        for (const [layer, value] of Object.entries(randomTraits)) {
            const select = document.getElementById(`trait-${layer}`);
            if (select) {
                select.value = value;
            }
        }

        // Auto-generate the new random selection
        showFullPageLoading('Generating new Trap Star...', 'Creating random traits');

        // Generate updated attributes with random traits
        const updatedAttributes = state.selectedNFT.attributes.map(attr => {
            const randomValue = randomTraits[attr.trait_type.toLowerCase()];
            if (randomValue !== undefined) {
                return { ...attr, value: randomValue };
            }
            return attr;
        });

        // Generate image with random traits
        const imageBlob = await generateImageFromTraits(updatedAttributes);

        // Clean up old image URL if it's a generated one
        if (state.selectedNFT.image && state.selectedNFT.image.startsWith('blob:')) {
            URL.revokeObjectURL(state.selectedNFT.image);
        }

        const newImageUrl = URL.createObjectURL(imageBlob);

        // Update state with new image and attributes
        state.selectedNFT.image = newImageUrl;
        state.selectedNFT.attributes = updatedAttributes;

        // Update the nftDisplay with new image and traits
        const nftDisplay = document.getElementById('nftDisplay');
        nftDisplay.innerHTML = `
            <h3 class="text-2xl font-semibold mb-4">${state.selectedNFT.name}</h3>
            <img src="${newImageUrl}" alt="${state.selectedNFT.name}" class="w-full max-w-md mx-auto rounded-lg shadow-lg mb-4">
            <div class="text-sm text-purple-200 space-y-1">
                ${updatedAttributes.slice(0, 5).map(attr => `
                    <div class="flex justify-between">
                        <span class="capitalize">${attr.trait_type}:</span>
                        <span class="font-semibold">${attr.value}</span>
                    </div>
                `).join('')}
            </div>
        `;

        hideFullPageLoading();

        console.log('✅ New random Trap Star generated');
    } catch (error) {
        hideFullPageLoading();
        console.error('Failed to generate new Trap Star:', error);
        alert('Failed to generate new Trap Star. Please try again.');
    }
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
            console.log('✅ Image generated:', blob.size, 'bytes');
            resolve(blob);
        }, 'image/jpeg', 0.85);
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
        // Validate wallet is still connected
        if (!window.walletAdapter) {
            throw new Error('Wallet not connected. Please reconnect your wallet and try again.');
        }

        // Validate swap parameters
        const { executeSwap: executeSwapTransaction, validateSwapParams } = await import('./swap.js');

        validateSwapParams(state.swap.donorNFT, state.swap.recipientNFT, state.swap.selectedTrait);

        // Use cached preview or generate composite image for recipient with new trait
        const compositeImageDataUrl = state.swap.compositeImageDataUrl || await generateImageForSwap();

        // Show full-page loading overlay
        showFullPageLoading('Processing Trait Swap', 'Please approve transactions in your wallet');

        // Execute swap with progress updates
        const result = await executeSwapTransaction(
            window.walletAdapter,
            state.swap.donorNFT,
            state.swap.recipientNFT,
            state.swap.selectedTrait,
            compositeImageDataUrl,
            (step, message) => {
                document.getElementById('fullPageLoadingTitle').textContent = message;
                document.getElementById('fullPageLoadingSubtext').textContent = `Step ${step} of 5`;
            },
            state.swap.useNewLogo
        );

        hideFullPageLoading();

        // Show success
        showSwapSuccess(result);

        // Refresh NFTs
        await fetchUserNFTs(state.walletAddress);

    } catch (error) {
        hideFullPageLoading();
        console.error('Swap failed:', error);
        alert(`Swap failed: ${error.message}\n\nPlease check the console for details.`);
    }
}

/**
 * Generate composite image for swap preview
 * Takes recipient's current traits + replaces ONE trait with the donor's trait
 */
async function generateImageForSwap() {
    try {
        // Get recipient's current traits as object
        const recipientTraits = {};
        state.swap.recipientNFT.attributes.forEach(attr => {
            recipientTraits[attr.trait_type] = attr.value;
        });

        // REPLACE with the new trait from donor
        recipientTraits[state.swap.selectedTrait.category] = state.swap.selectedTrait.value;

        // Handle Logo trait based on user preference
        const useNewLogo = state.swap.useNewLogo !== false; // Default to true
        recipientTraits['Logo'] = useNewLogo ? 'Uzi' : 'Trap Stars';

        // Convert back to attributes array format
        const updatedAttributes = Object.entries(recipientTraits).map(([trait_type, value]) => ({
            trait_type,
            value
        }));

        // Store updated attributes for later use in swap execution
        state.swap.updatedAttributes = updatedAttributes;

        // Generate composite image with logo preference
        const logoOptions = useNewLogo ? {
            logoUrl: 'https://trapstars-assets.netlify.app/logo/new%20logo.png',
            useNewLogo: true
        } : {};

        const imageBlob = await generateImageFromTraits(updatedAttributes, logoOptions);

        // Convert blob to data URL for preview
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(imageBlob);
        });
    } catch (error) {
        console.error('Failed to generate composite image:', error);
        throw new Error('Failed to generate preview image');
    }
}

// Helper function to display signatures with proper formatting and Solscan links
function displaySignature(label, signature) {
    try {
        let sig = signature;

        // If signature is an array or Uint8Array, convert to base58
        if (Array.isArray(signature) || signature instanceof Uint8Array) {
            sig = bs58.encode(signature instanceof Uint8Array ? signature : new Uint8Array(signature));
        }

        return `
            <div>
                <p class="text-xs text-gray-400 mb-1">${label}</p>
                <a href="https://solscan.io/tx/${sig}"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="font-mono text-sm text-blue-400 hover:text-blue-300 break-all underline">
                    ${sig}
                </a>
            </div>
        `;
    } catch (error) {
        console.error(`Error displaying signature for ${label}:`, error);

        // Fallback if conversion fails
        return `
            <div>
                <p class="text-xs text-gray-400 mb-1">${label}</p>
                <p class="font-mono text-sm text-gray-500 break-all">${signature?.toString() || 'N/A'}</p>
            </div>
        `;
    }
}

// Show swap success screen
function showSwapSuccess(result) {
    hideElement(document.getElementById('swapPage'));

    const successHTML = `
        <div class="max-w-4xl mx-auto text-center fade-in">
            <div class="text-6xl mb-6">✅</div>
            <h2 class="text-4xl font-light mb-4">Swap Successful!</h2>
            <p class="text-gray-400 mb-4">Your Trap Star has been upgraded with the new trait</p>
            <p class="text-sm text-blue-400 mb-8">Please allow at least 2-5 minutes for changes to show up on Phantom, Magic Eden etc.</p>

            <div class="glass rounded-2xl p-8 mb-6">
                <h3 class="text-xl font-semibold mb-4">Transaction Details</h3>
                <div class="space-y-3 text-left">
                    ${displaySignature('Service Fee Payment', result.serviceFeeSignature)}
                    ${displaySignature('Update Fee Payment', result.reimbursementFeeSignature)}
                    ${displaySignature('NFT Transfer to Burn Wallet', result.nftTransferSignature)}
                    ${displaySignature('Metadata Update', result.metadataUpdateSignature)}
                    <div>
                        <p class="text-xs text-gray-400 mb-1">New Image URL</p>
                        <a href="${result.imageUrl}" target="_blank"
                           rel="noopener noreferrer"
                           class="font-mono text-sm text-blue-400 hover:text-blue-300 break-all underline">
                            ${result.imageUrl}
                        </a>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400 mb-1">New Metadata URL</p>
                        <a href="${result.metadataUrl}" target="_blank"
                           rel="noopener noreferrer"
                           class="font-mono text-sm text-blue-400 hover:text-blue-300 break-all underline">
                            ${result.metadataUrl}
                        </a>
                    </div>
                </div>
            </div>

            <div class="glass rounded-2xl p-6 mb-6">
                <h3 class="text-xl font-semibold mb-4">Your New Trap Star</h3>
                <div class="flex justify-center">
                    <img src="${result.imageUrl}"
                         alt="Updated Trap Star NFT"
                         class="rounded-xl border-2 border-green-500 max-w-md w-full shadow-lg">
                </div>
            </div>

            <div class="flex gap-4 justify-center">
                <button onclick="resetSwapFlow()" class="btn-primary px-8 py-3 rounded-xl">
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
async function generateImageFromTraits(attributes, options = {}) {
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

    // Use custom logo URL if provided, otherwise use default
    const defaultLogoUrl = import.meta.env.VITE_LOGO_URL || 'https://trapstars-assets.netlify.app/logo/logo.png';
    const logoUrl = options.logoUrl || defaultLogoUrl;
    const logoType = options.useNewLogo ? 'New Uzi Logo' : 'Trap Stars Logo';

    console.log(`Drawing ${logoType} overlay from: ${logoUrl}`);

    try {
        await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                ctx.drawImage(img, 0, 0, config.imageSize, config.imageSize);
                console.log(`✅ ${logoType} overlay drawn`);
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
        }, 'image/jpeg', 0.85);
    });
}

// Expose state and config globally for swap-ui
window.appState = state;
window.appConfig = config;
window.showModeSelection = showModeSelection;
window.resetSwapFlow = resetSwapFlow;
window.generateImageFromTraits = generateImageFromTraits;
window.generateImageForSwap = generateImageForSwap;

// OLD SWAP FUNCTION REMOVED - replaced with customization flow above

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}