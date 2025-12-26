import { createClient } from '@supabase/supabase-js';
import { ShoppingCart, createCartUI } from './shop-cart.js';
import './shop-styles.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

let cart = null;
let cartUI = null;
let currentCheckoutStep = null;
let selectedTargetNFT = null;
let selectedBurnNFTs = [];
let userNFTs = [];
let previewImage = null;

export async function loadShop(container, walletAdapter) {
  container.innerHTML = '';

  cart = new ShoppingCart();

  const shopWrapper = document.createElement('div');
  shopWrapper.className = 'shop-wrapper';
  shopWrapper.innerHTML = `
    <div class="shop-header">
      <h1 class="shop-title-clickable" style="cursor: pointer;">Trap Stars Trait Shop</h1>
      <p>Exclusive traits for your Trap Stars - Burn NFTs or Pay with SOL</p>
    </div>
    <div class="shop-grid"></div>
    <div style="text-align: center; margin: 40px 0; padding-bottom: 40px;">
      <button class="btn-secondary back-to-home-btn" style="padding: 12px 32px; border-radius: 12px;">
        ← Back to Home
      </button>
    </div>
  `;

  container.appendChild(shopWrapper);

  const titleBtn = shopWrapper.querySelector('.shop-title-clickable');
  titleBtn.addEventListener('click', () => {
    if (window.showModeSelection) {
      window.showModeSelection();
    }
  });

  const backBtn = shopWrapper.querySelector('.back-to-home-btn');
  backBtn.addEventListener('click', () => {
    if (window.showModeSelection) {
      window.showModeSelection();
    }
  });

  cartUI = createCartUI(cart, container);

  cartUI.checkoutBtn.addEventListener('click', () => {
    cartUI.cartModal.style.display = 'none';
    startCheckoutFlow(container, walletAdapter);
  });

  await loadTraits(shopWrapper.querySelector('.shop-grid'));
}

async function loadTraits(gridContainer) {
  try {
    const { data: traits, error } = await supabase
      .from('shop_traits')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    gridContainer.innerHTML = traits.map(trait => createTraitCard(trait)).join('');

    traits.forEach(trait => {
      const card = gridContainer.querySelector(`[data-trait-id="${trait.id}"]`);
      const addBtn = card.querySelector('.add-to-cart-btn');

      addBtn.addEventListener('click', () => {
        if (cart.hasItem(trait.id)) {
          cart.removeItem(trait.id);
          updateCardState(card, addBtn, false);
        } else {
          cart.addItem(trait);
          updateCardState(card, addBtn, true);
        }
      });
    });

  } catch (error) {
    console.error('Error loading traits:', error);
    gridContainer.innerHTML = '<p style="color: white; text-align: center;">Error loading shop. Please try again.</p>';
  }
}

function createTraitCard(trait) {
  return `
    <div class="shop-trait-card" data-trait-id="${trait.id}">
      <div class="trait-image-container">
        <img src="${trait.image_url}" alt="${trait.name}">
      </div>
      <div class="trait-info">
        <h3 class="trait-name">${trait.name}</h3>
        <p class="trait-category">${trait.category}</p>
        <div class="trait-pricing">
          <div class="trait-price-option">
            <span class="trait-price-label">Burn:</span>
            <span class="trait-price-value">${trait.burn_cost} Trap Star${trait.burn_cost !== 1 ? 's' : ''}</span>
          </div>
          <div class="trait-price-option">
            <span class="trait-price-label">Or Pay:</span>
            <span class="trait-price-value">${trait.sol_price} SOL</span>
          </div>
        </div>
        <button class="add-to-cart-btn">Add to Cart</button>
      </div>
    </div>
  `;
}

function updateCardState(card, button, inCart) {
  if (inCart) {
    card.classList.add('in-cart');
    button.classList.add('in-cart');
    button.textContent = 'In Cart ✓';
  } else {
    card.classList.remove('in-cart');
    button.classList.remove('in-cart');
    button.textContent = 'Add to Cart';
  }
}

async function startCheckoutFlow(container, walletAdapter) {
  if (cartUI && cartUI.continueFloatingBtn) {
    cartUI.continueFloatingBtn.style.display = 'none';
  }
  currentCheckoutStep = 'target-selection';
  await showTargetSelection(container, walletAdapter);
}

async function showTargetSelection(container, walletAdapter) {
  const items = cart.getItems();

  container.innerHTML = `
    <link rel="stylesheet" href="/shop-styles.css">
    <div class="checkout-container">
      <div class="checkout-header">
        <h2>Select Your Trap Star</h2>
        <p>Choose which Trap Star will receive these traits</p>
      </div>
      <div class="checkout-content">
        <div class="cart-summary">
          <h3>Items in Cart (${items.length})</h3>
          <div class="cart-summary-items">
            ${items.map(item => `
              <div class="summary-item">
                <img src="${item.image_url}" alt="${item.name}">
                <span>${item.name}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="nft-selection">
          <h3>Your Trap Stars</h3>
          <div class="loading-message">Loading your Trap Stars...</div>
          <div class="nft-grid" style="display: none;"></div>
        </div>
      </div>
      <div class="preview-section" style="display: none;">
        <h3>Preview</h3>
        <div class="preview-container">
          <img class="preview-image" src="" alt="Preview">
        </div>
      </div>
      <div class="checkout-actions">
        <button class="btn-secondary checkout-back">Back to Shop</button>
        <button class="btn-primary checkout-continue" disabled>Continue to Payment</button>
      </div>
    </div>
  `;

  const backBtn = container.querySelector('.checkout-back');
  const continueBtn = container.querySelector('.checkout-continue');
  const nftGrid = container.querySelector('.nft-grid');
  const loadingMsg = container.querySelector('.loading-message');
  const previewSection = container.querySelector('.preview-section');
  const previewImg = container.querySelector('.preview-image');

  backBtn.addEventListener('click', () => {
    loadShop(container, walletAdapter);
  });

  continueBtn.addEventListener('click', () => {
    showPaymentSelection(container, walletAdapter);
  });

  try {
    userNFTs = await fetchUserNFTs(walletAdapter);
    loadingMsg.style.display = 'none';
    nftGrid.style.display = 'grid';

    if (userNFTs.length === 0) {
      nftGrid.innerHTML = '<p style="color: white;">No Trap Stars found in your wallet.</p>';
      return;
    }

    nftGrid.innerHTML = userNFTs.map((nft, index) => `
      <div class="nft-card selectable" data-index="${index}">
        <img src="${nft.image || nft.cached_image_uri}" alt="${nft.name}">
        <p>${nft.name || 'Trap Star'}</p>
      </div>
    `).join('');

    const nftCards = nftGrid.querySelectorAll('.nft-card');
    nftCards.forEach((card, index) => {
      card.addEventListener('click', async () => {
        nftCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedTargetNFT = userNFTs[index];
        continueBtn.disabled = false;

        previewSection.style.display = 'block';
        previewImg.src = '';
        previewImg.alt = 'Generating preview...';

        await generatePreview(selectedTargetNFT, items, previewImg);
      });
    });

  } catch (error) {
    console.error('Error loading NFTs:', error);
    loadingMsg.textContent = 'Error loading your Trap Stars. Please try again.';
  }
}

async function generatePreview(targetNFT, cartItems, previewImgElement) {
  try {
    previewImgElement.style.opacity = '0.5';

    const existingTraits = targetNFT.content?.metadata?.attributes || targetNFT.attributes || [];
    console.log('Existing traits:', existingTraits);

    const newTraits = cartItems.map(item => ({
      trait_type: item.category,
      value: item.trait_value || item.name
    }));
    console.log('New traits to apply:', newTraits);

    const allTraits = [...existingTraits];

    newTraits.forEach(newTrait => {
      const existingIndex = allTraits.findIndex(t =>
        t.trait_type.toLowerCase() === newTrait.trait_type.toLowerCase()
      );
      if (existingIndex !== -1) {
        allTraits[existingIndex] = newTrait;
      } else {
        allTraits.push(newTrait);
      }
    });

    console.log('Final traits for preview:', allTraits);

    if (!window.generateImageFromTraits) {
      throw new Error('Image generation function not available');
    }

    const logoTrait = allTraits.find(t => t.trait_type.toLowerCase() === 'logo');
    const logoOptions = {};

    if (logoTrait && logoTrait.value.toLowerCase() === 'uzi') {
      logoOptions.logoUrl = 'https://trapstars-assets.netlify.app/logo/new%20logo.png';
      logoOptions.useNewLogo = true;
      console.log('Using Uzi logo for preview');
    } else {
      console.log('Using default Trap Stars logo for preview');
    }

    const imageBlob = await window.generateImageFromTraits(allTraits, logoOptions);
    if (!imageBlob) {
      throw new Error('No image blob generated');
    }

    const previewUrl = URL.createObjectURL(imageBlob);
    previewImage = previewUrl;
    previewImgElement.src = previewUrl;
    previewImgElement.alt = 'Preview of your updated Trap Star';
    previewImgElement.style.opacity = '1';

  } catch (error) {
    console.error('Error generating preview:', error);
    previewImgElement.src = targetNFT.image || targetNFT.cached_image_uri || '';
    previewImgElement.alt = 'Preview unavailable - showing original';
    previewImgElement.style.opacity = '1';
  }
}

function showPaymentSelection(container, walletAdapter) {
  const items = cart.getItems();
  const totalBurn = cart.getTotalBurnCost();
  const totalSOL = cart.getTotalSOLPrice();

  container.innerHTML = `
    <link rel="stylesheet" href="/shop-styles.css">
    <div class="checkout-container">
      <div class="checkout-header">
        <h2>Choose Payment Method</h2>
        <p>How would you like to pay for these traits?</p>
      </div>
      <div class="order-summary">
        <div class="summary-section">
          <h3>Order Summary</h3>
          <div class="summary-items">
            ${items.map(item => `
              <div class="summary-row">
                <span>${item.name}</span>
                <span>${item.burn_cost} Trap Star${item.burn_cost !== 1 ? 's' : ''} / ${item.sol_price} SOL</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="summary-section">
          <img src="${previewImage}" alt="Preview" class="summary-preview">
          <p class="summary-nft-name">${selectedTargetNFT.name || 'Selected Trap Star'}</p>
        </div>
      </div>
      <div class="payment-options">
        <div class="payment-option burn-option">
          <h3>Burn Trap Stars</h3>
          <p class="payment-amount">${totalBurn} Trap Star${totalBurn !== 1 ? 's' : ''}</p>
          <p class="payment-desc">Permanently burn ${totalBurn} Trap Star${totalBurn !== 1 ? 's' : ''} from your wallet</p>
          <button class="btn-primary select-burn">Pay with Burn</button>
        </div>
        <div class="payment-option sol-option">
          <h3>Pay with SOL</h3>
          <p class="payment-amount">${totalSOL.toFixed(2)} SOL</p>
          <p class="payment-desc">Make a direct SOL payment</p>
          <button class="btn-primary select-sol">Pay with SOL</button>
        </div>
      </div>
      <div class="checkout-actions">
        <button class="btn-secondary checkout-back">Back</button>
      </div>
    </div>
  `;

  const backBtn = container.querySelector('.checkout-back');
  const burnBtn = container.querySelector('.select-burn');
  const solBtn = container.querySelector('.select-sol');

  backBtn.addEventListener('click', () => {
    showTargetSelection(container, walletAdapter);
  });

  burnBtn.addEventListener('click', () => {
    showBurnSelection(container, walletAdapter);
  });

  solBtn.addEventListener('click', () => {
    showOrderConfirmation(container, walletAdapter, 'sol');
  });
}

async function showBurnSelection(container, walletAdapter) {
  const totalBurn = cart.getTotalBurnCost();

  container.innerHTML = `
    <link rel="stylesheet" href="/shop-styles.css">
    <div class="checkout-container">
      <div class="checkout-header">
        <h2>Select Trap Stars to Burn</h2>
        <p>Choose ${totalBurn} Trap Star${totalBurn !== 1 ? 's' : ''} to burn permanently</p>
        <p class="selection-counter">Selected: <span class="selected-count">0</span> / ${totalBurn}</p>
      </div>
      <div class="burn-warning">
        ⚠️ Warning: Selected Trap Stars will be permanently burned and cannot be recovered
      </div>
      <div class="nft-grid burn-grid">
        ${userNFTs.map((nft, index) => {
          const isTarget = nft.mint === selectedTargetNFT.mint;
          return `
            <div class="nft-card ${isTarget ? 'disabled' : 'burnable'}" data-index="${index}">
              <div class="burn-checkbox"></div>
              <img src="${nft.image || nft.cached_image_uri}" alt="${nft.name}">
              <p>${nft.name || 'Trap Star'}</p>
              ${isTarget ? '<span class="target-badge">Receiving Traits</span>' : ''}
            </div>
          `;
        }).join('')}
      </div>
      <div class="checkout-actions">
        <button class="btn-secondary checkout-back">Back</button>
        <button class="btn-primary checkout-continue" disabled>Review Order</button>
      </div>
    </div>
  `;

  const continueBtn = container.querySelector('.checkout-continue');
  const backBtn = container.querySelector('.checkout-back');
  const selectedCountSpan = container.querySelector('.selected-count');
  const burnableCards = container.querySelectorAll('.nft-card.burnable');

  selectedBurnNFTs = [];

  burnableCards.forEach((card, cardIndex) => {
    card.addEventListener('click', () => {
      const nftIndex = parseInt(card.dataset.index);
      const nft = userNFTs[nftIndex];

      if (card.classList.contains('burn-selected')) {
        card.classList.remove('burn-selected');
        selectedBurnNFTs = selectedBurnNFTs.filter(n => n.mint !== nft.mint);
      } else if (selectedBurnNFTs.length < totalBurn) {
        card.classList.add('burn-selected');
        selectedBurnNFTs.push(nft);
      }

      selectedCountSpan.textContent = selectedBurnNFTs.length;
      continueBtn.disabled = selectedBurnNFTs.length !== totalBurn;
    });
  });

  backBtn.addEventListener('click', () => {
    showPaymentSelection(container, walletAdapter);
  });

  continueBtn.addEventListener('click', () => {
    showOrderConfirmation(container, walletAdapter, 'burn');
  });
}

function showOrderConfirmation(container, walletAdapter, paymentMethod) {
  const items = cart.getItems();
  const config = {
    reimbursementSOL: parseFloat(import.meta.env.VITE_REIMBURSEMENT_FEE),
    collectionFeeSOL: parseFloat(import.meta.env.VITE_SERVICE_FEE)
  };
  const totalFees = config.reimbursementSOL + config.collectionFeeSOL;

  let paymentDetails = '';
  let totalCost = 0;

  if (paymentMethod === 'burn') {
    totalCost = totalFees;
    paymentDetails = `
      <div class="payment-breakdown">
        <h3>Burning ${selectedBurnNFTs.length} Trap Star${selectedBurnNFTs.length !== 1 ? 's' : ''}</h3>
        <div class="burn-nfts-list">
          ${selectedBurnNFTs.map(nft => `
            <div class="burn-nft-item">
              <img src="${nft.image || nft.cached_image_uri}" alt="${nft.name}">
              <span>${nft.name || 'Trap Star'}</span>
            </div>
          `).join('')}
        </div>
        <div class="fee-breakdown">
          <div class="fee-row">
            <span>Reimbursement Fee:</span>
            <span>${config.reimbursementSOL} SOL</span>
          </div>
          <div class="fee-row">
            <span>Collection Fee:</span>
            <span>${config.collectionFeeSOL} SOL</span>
          </div>
          <div class="fee-row total">
            <span>Total Fees:</span>
            <span>${totalFees.toFixed(4)} SOL</span>
          </div>
        </div>
      </div>
    `;
  } else {
    const itemsTotal = cart.getTotalSOLPrice();
    totalCost = itemsTotal + totalFees;
    paymentDetails = `
      <div class="payment-breakdown">
        <h3>SOL Payment</h3>
        <div class="fee-breakdown">
          <div class="fee-row">
            <span>Items Total:</span>
            <span>${itemsTotal.toFixed(4)} SOL</span>
          </div>
          <div class="fee-row">
            <span>Reimbursement Fee:</span>
            <span>${config.reimbursementSOL} SOL</span>
          </div>
          <div class="fee-row">
            <span>Collection Fee:</span>
            <span>${config.collectionFeeSOL} SOL</span>
          </div>
          <div class="fee-row total">
            <span>Total Amount:</span>
            <span>${totalCost.toFixed(4)} SOL</span>
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <link rel="stylesheet" href="/shop-styles.css">
    <div class="checkout-container">
      <div class="checkout-header">
        <h2>Order Review</h2>
        <p>Please review your order before confirming</p>
      </div>
      <div class="confirmation-content">
        <div class="confirmation-section">
          <h3>Items (${items.length})</h3>
          <div class="items-list">
            ${items.map(item => `
              <div class="item-row">
                <img src="${item.image_url}" alt="${item.name}">
                <span>${item.name}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="confirmation-section">
          <h3>Target Trap Star</h3>
          <div class="target-nft-display">
            <img src="${previewImage}" alt="Preview">
            <p>${selectedTargetNFT.name || 'Trap Star'}</p>
          </div>
        </div>
        <div class="confirmation-section">
          ${paymentDetails}
        </div>
        ${paymentMethod === 'burn' ? '<div class="final-warning">⚠️ This action cannot be undone. Your selected Trap Stars will be permanently burned.</div>' : ''}
      </div>
      <div class="checkout-actions">
        <button class="btn-secondary checkout-back">Cancel</button>
        <button class="btn-primary checkout-confirm">Confirm Purchase</button>
      </div>
    </div>
  `;

  const backBtn = container.querySelector('.checkout-back');
  const confirmBtn = container.querySelector('.checkout-confirm');

  backBtn.addEventListener('click', () => {
    if (paymentMethod === 'burn') {
      showBurnSelection(container, walletAdapter);
    } else {
      showPaymentSelection(container, walletAdapter);
    }
  });

  confirmBtn.addEventListener('click', () => {
    processTransaction(container, walletAdapter, paymentMethod, totalCost);
  });
}

async function processTransaction(container, walletAdapter, paymentMethod, totalCost) {
  container.innerHTML = `
    <link rel="stylesheet" href="/shop-styles.css">
    <div class="checkout-container">
      <div class="checkout-header">
        <h2>Processing Transaction</h2>
      </div>
      <div class="transaction-progress">
        <div class="progress-step active">
          <div class="progress-icon">⏳</div>
          <p>Processing payment...</p>
        </div>
        <div class="progress-step">
          <div class="progress-icon">🎨</div>
          <p>Applying traits...</p>
        </div>
        <div class="progress-step">
          <div class="progress-icon">📝</div>
          <p>Updating metadata...</p>
        </div>
        <div class="progress-step">
          <div class="progress-icon">✅</div>
          <p>Completing purchase...</p>
        </div>
      </div>
    </div>
  `;

  try {
    let transactionSignature = '';

    if (paymentMethod === 'burn') {
      transactionSignature = await processBurnPayment(selectedBurnNFTs, walletAdapter);
    } else {
      transactionSignature = await processSOLPayment(totalCost, walletAdapter);
    }

    updateProgressStep(container, 2);

    await applyTraitsToNFT(selectedTargetNFT, cart.getItems());

    updateProgressStep(container, 3);

    await recordPurchase(paymentMethod, transactionSignature);

    updateProgressStep(container, 4);

    await new Promise(resolve => setTimeout(resolve, 1000));

    showSuccessScreen(container, walletAdapter, transactionSignature);

  } catch (error) {
    console.error('Transaction error:', error);
    showFailureScreen(container, walletAdapter, error.message);
  }
}

function updateProgressStep(container, stepNumber) {
  const steps = container.querySelectorAll('.progress-step');
  steps.forEach((step, index) => {
    if (index < stepNumber) {
      step.classList.remove('active');
      step.classList.add('completed');
    } else if (index === stepNumber - 1) {
      step.classList.add('active');
    }
  });
}

async function processBurnPayment(nftsToBurn, walletAdapter) {
  const { transferNFT, transferSOL } = await import('./blockchain.js');

  const collectionWallet = import.meta.env.VITE_COLLECTION_WALLET;
  const reimbursementWallet = import.meta.env.VITE_REIMBURSEMENT_WALLET;
  const collectionAddress = import.meta.env.VITE_COLLECTION_ADDRESS;
  const reimbursementFee = parseFloat(import.meta.env.VITE_REIMBURSEMENT_FEE);
  const serviceFee = parseFloat(import.meta.env.VITE_SERVICE_FEE);

  let firstSignature = '';

  for (let i = 0; i < nftsToBurn.length; i++) {
    const nft = nftsToBurn[i];
    const signature = await transferNFT(walletAdapter, nft.mint, collectionWallet, collectionAddress);

    if (i === 0) {
      firstSignature = signature;
    }
  }

  await transferSOL(walletAdapter, collectionWallet, serviceFee);
  await transferSOL(walletAdapter, reimbursementWallet, reimbursementFee);

  return firstSignature;
}

async function processSOLPayment(amount, walletAdapter) {
  const { transferSOL } = await import('./blockchain.js');

  const collectionWallet = import.meta.env.VITE_COLLECTION_WALLET;
  const reimbursementWallet = import.meta.env.VITE_REIMBURSEMENT_WALLET;
  const reimbursementFee = parseFloat(import.meta.env.VITE_REIMBURSEMENT_FEE);
  const serviceFee = parseFloat(import.meta.env.VITE_SERVICE_FEE);

  const itemsTotal = cart.getTotalSOLPrice();
  const collectionAmount = itemsTotal + serviceFee;

  const collectionSignature = await transferSOL(walletAdapter, collectionWallet, collectionAmount);

  await transferSOL(walletAdapter, reimbursementWallet, reimbursementFee);

  return collectionSignature;
}

async function applyTraitsToNFT(targetNFT, items) {
  const { updateNFTMetadata } = await import('./blockchain.js');

  console.log('🎯 Target NFT:', targetNFT);
  console.log('🎯 Target NFT mint:', targetNFT?.mint);
  console.log('🎯 Items to apply:', items);

  const existingTraits = targetNFT.content?.metadata?.attributes || targetNFT.attributes || [];
  const newTraits = items.map(item => ({
    trait_type: item.category,
    value: item.trait_value || item.name
  }));

  const mergedTraits = [...existingTraits];
  newTraits.forEach(newTrait => {
    const existingIndex = mergedTraits.findIndex(t =>
      t.trait_type.toLowerCase() === newTrait.trait_type.toLowerCase()
    );
    if (existingIndex !== -1) {
      mergedTraits[existingIndex] = newTrait;
    } else {
      mergedTraits.push(newTrait);
    }
  });

  const logoTrait = mergedTraits.find(t => t.trait_type.toLowerCase() === 'logo');
  const logoOptions = {};

  if (logoTrait && logoTrait.value.toLowerCase() === 'uzi') {
    logoOptions.logoUrl = 'https://trapstars-assets.netlify.app/logo/new%20logo.png';
    logoOptions.useNewLogo = true;
    console.log('Using Uzi logo for final image');
  } else {
    console.log('Using default Trap Stars logo for final image');
  }

  const imageBlob = await window.generateImageFromTraits(mergedTraits, logoOptions);

  const reader = new FileReader();
  const imageDataUrl = await new Promise((resolve, reject) => {
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(imageBlob);
  });

  const lastItem = items[items.length - 1];
  console.log(`✅ Applying ${items.length} trait(s) to NFT ${targetNFT.mint}`);
  console.log(`📝 Last trait being applied: ${lastItem.category} → ${lastItem.trait_value || lastItem.name}`);
  console.log(`🎨 Using new logo: ${logoOptions.useNewLogo || false}`);

  await updateNFTMetadata(
    targetNFT.mint,
    lastItem.category,
    lastItem.trait_value || lastItem.name,
    imageDataUrl,
    logoOptions.useNewLogo || false
  );
}

async function recordPurchase(paymentMethod, transactionSignature) {
  const items = cart.getItems();
  const walletAddress = window.solana?.publicKey?.toString() || 'unknown';

  const reimbursementFee = parseFloat(import.meta.env.VITE_REIMBURSEMENT_FEE);
  const serviceFee = parseFloat(import.meta.env.VITE_SERVICE_FEE);
  const totalFees = reimbursementFee + serviceFee;

  const solAmount = paymentMethod === 'burn'
    ? totalFees
    : cart.getTotalSOLPrice() + totalFees;

  for (const item of items) {
    await supabase.from('trait_purchases').insert({
      wallet_address: walletAddress,
      trait_id: item.id,
      payment_method: paymentMethod,
      nfts_burned_count: paymentMethod === 'burn' ? selectedBurnNFTs.length : 0,
      burned_nft_mints: paymentMethod === 'burn' ? selectedBurnNFTs.map(n => n.mint) : [],
      sol_amount: solAmount,
      transaction_signature: transactionSignature,
      target_nft_mint: selectedTargetNFT.mint,
      status: 'completed'
    });
  }
}

function showSuccessScreen(container, walletAdapter, transactionSignature) {
  container.innerHTML = `
    <link rel="stylesheet" href="/shop-styles.css">
    <div class="checkout-container success-screen">
      <div class="success-animation">
        <div class="success-checkmark">✓</div>
      </div>
      <div class="checkout-header">
        <h2>Purchase Successful!</h2>
        <p>Your Trap Star has been updated with new traits</p>
      </div>
      <div class="success-content">
        <div class="success-image">
          <img src="${previewImage}" alt="Updated Trap Star">
        </div>
        <div class="success-details">
          <p><strong>Transaction:</strong> <a href="https://solscan.io/tx/${transactionSignature}" target="_blank">${transactionSignature.substring(0, 20)}...</a></p>
          <p><strong>Traits Applied:</strong> ${cart.getItemCount()}</p>
        </div>
      </div>
      <div class="checkout-actions">
        <button class="btn-primary continue-shopping">Continue Shopping</button>
      </div>
    </div>
  `;

  const continueBtn = container.querySelector('.continue-shopping');
  continueBtn.addEventListener('click', () => {
    cart.clear();
    loadShop(container, walletAdapter);
  });
}

function showFailureScreen(container, walletAdapter, errorMessage) {
  container.innerHTML = `
    <link rel="stylesheet" href="/shop-styles.css">
    <div class="checkout-container failure-screen">
      <div class="failure-icon">✗</div>
      <div class="checkout-header">
        <h2>Transaction Failed</h2>
        <p>We encountered an error processing your purchase</p>
      </div>
      <div class="error-details">
        <p><strong>Error:</strong> ${errorMessage}</p>
      </div>
      <div class="checkout-actions">
        <button class="btn-secondary back-to-shop">Back to Shop</button>
        <button class="btn-primary try-again">Try Again</button>
      </div>
    </div>
  `;

  const backBtn = container.querySelector('.back-to-shop');
  const retryBtn = container.querySelector('.try-again');

  backBtn.addEventListener('click', () => {
    loadShop(container, walletAdapter);
  });

  retryBtn.addEventListener('click', () => {
    showPaymentSelection(container, walletAdapter);
  });
}

async function fetchUserNFTs(walletAdapter) {
  if (window.appState && window.appState.nfts) {
    return window.appState.nfts.map(nft => ({
      mint: nft.id,
      name: nft.content?.metadata?.name || nft.name || 'Trap Star',
      image: nft.content?.links?.image || nft.cached_image_uri || nft.image,
      cached_image_uri: nft.cached_image_uri,
      attributes: nft.content?.metadata?.attributes || nft.attributes || [],
      content: nft.content
    }));
  }
  return [];
}
