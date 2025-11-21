// Trap Stars Trait Shop - Production App
// This file handles all wallet connections, NFT fetching, image generation, and blockchain transactions

// Load configuration
let config = null;

// State management
const state = {
    walletAddress: null,
    nfts: [],
    traitLayers: {},
    selectedNFT: null,
    customTraits: {}, // Store selected custom traits
    previewImage: null
};

// Initialize app
async function init() {
    console.log('🚀 Trap Stars Trait Shop - Production Mode');

    // Load config from environment variables (production) or config.json (local dev)
    try {
        // Try to load from config.json first (local development)
        const response = await fetch('config.json');
        if (response.ok) {
            config = await response.json();
            console.log('✅ Configuration loaded from config.json');
        } else {
            throw new Error('config.json not found, trying environment variables');
        }
    } catch (err) {
        console.log('⚠️ config.json not found, loading from environment variables...');

        // Load from environment variables (Vite uses import.meta.env)
        if (import.meta.env.VITE_HELIUS_API_KEY) {
            config = {
                heliusApiKey: import.meta.env.VITE_HELIUS_API_KEY,
                collectionAddress: import.meta.env.VITE_COLLECTION_ADDRESS,
                updateAuthority: import.meta.env.VITE_UPDATE_AUTHORITY,
                updateAuthorityPrivateKey: JSON.parse(import.meta.env.VITE_UPDATE_AUTHORITY_PRIVATE_KEY || '[]'),
                rpcEndpoint: import.meta.env.VITE_RPC_ENDPOINT,
                layerOrder: JSON.parse(import.meta.env.VITE_LAYER_ORDER || '["background","body","shirt","weapons","accessories","logo","meme","iceout chain","face","mouth","eyes","eyebrows","hair","eyewear","headwear"]'),
                optionalLayers: JSON.parse(import.meta.env.VITE_OPTIONAL_LAYERS || '["face","eyewear","headwear","accessories","weapons","iceout chain"]'),
                imageSize: parseInt(import.meta.env.VITE_IMAGE_SIZE || '1750')
            };
            console.log('✅ Configuration loaded from environment variables');
        } else {
            console.error('❌ No configuration found');
            showStatus('⚠️ Configuration not found. Please set up environment variables in Netlify.', 'error');
            return;
        }
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
        
    } catch (err) {
        console.error('❌ Connection error:', err);
        showStatus('Failed to connect: ' + err.message, 'error');
    }
}

async function disconnectWallet() {
    await window.solana.disconnect();
    state.walletAddress = null;
    state.nfts = [];
    showElement(document.getElementById('connectSection'));
    hideElement(document.getElementById('walletInfo'));
    hideElement(document.getElementById('content'));
    showStatus('Disconnected', 'info');
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
                const imagePath = `/${category}/${traitName}.png`;

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
        <h2 class="text-3xl font-bold mb-6 text-center">Select Trap Star to Customize</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${state.nfts.map((nft, idx) => `
                <div onclick="selectNFTToCustomize(${idx})" class="glass rounded-xl p-4 cursor-pointer hover:bg-opacity-20 border-2 border-transparent hover:border-purple-400 transition-all transform hover:scale-105">
                    <img src="${nft.image}" alt="${nft.name}" class="w-full rounded-lg mb-3 shadow-lg">
                    <h3 class="font-bold mb-2 text-lg">${nft.name}</h3>
                    <div class="space-y-1 text-sm text-purple-200">
                        ${nft.attributes.slice(0, 3).map(attr => `
                            <div class="flex justify-between">
                                <span class="capitalize">${attr.trait_type}:</span>
                                <span class="font-semibold">${attr.value}</span>
                            </div>
                        `).join('')}
                        ${nft.attributes.length > 3 ? `<p class="text-xs text-purple-300 mt-2">+${nft.attributes.length - 3} more traits</p>` : ''}
                    </div>
                </div>
            `).join('')}
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
    
    // Build trait selection dropdowns based on layer order
    const traitHTML = config.layerOrder.map(layerName => {
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
    console.log('🎨 Starting image generation...');
    console.log('State:', {
        hasTraitLayers: !!state.traitLayers,
        layerCount: state.traitLayers ? Object.keys(state.traitLayers).length : 0,
        hasConfig: !!config,
        hasSelectedNFT: !!state.selectedNFT
    });

    if (!config) {
        throw new Error('Configuration not loaded!');
    }

    if (!config.layerOrder || !Array.isArray(config.layerOrder)) {
        throw new Error('Layer order not defined in config!');
    }

    if (!state.traitLayers || Object.keys(state.traitLayers).length === 0) {
        throw new Error('Trait layers not loaded! Please wait for traits to load or refresh the page.');
    }

    if (!state.selectedNFT || !state.selectedNFT.attributes) {
        throw new Error('No NFT selected or NFT has no attributes!');
    }

    const canvas = document.createElement('canvas');
    canvas.width = config.imageSize;
    canvas.height = config.imageSize;
    const ctx = canvas.getContext('2d');

    console.log('Canvas created:', canvas.width, 'x', canvas.height);

    // Build attributes from original + custom overrides
    const updatedAttributes = state.selectedNFT.attributes.map(attr => {
        const customValue = state.customTraits[attr.trait_type.toLowerCase()];
        if (customValue !== undefined) {
            return { ...attr, value: customValue };
        }
        return attr;
    });

    // Add any new traits that weren't in original
    for (const [traitType, value] of Object.entries(state.customTraits)) {
        if (!updatedAttributes.find(a => a.trait_type.toLowerCase() === traitType.toLowerCase())) {
            updatedAttributes.push({ trait_type: traitType, value: value });
        }
    }

    console.log('Updated attributes:', updatedAttributes);

    let layersDrawn = 0;
    const missingLayers = [];

    // Draw layers in order
    for (const layerName of config.layerOrder) {
        const trait = updatedAttributes.find(attr =>
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

// OLD SWAP FUNCTION REMOVED - replaced with customization flow above

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}