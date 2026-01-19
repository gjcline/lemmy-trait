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
let shopSubscription = null;

export async function loadShop(container, walletAdapter) {
  container.innerHTML = '';

  if (shopSubscription) {
    supabase.removeChannel(shopSubscription);
    shopSubscription = null;
  }

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
    if (shopSubscription) {
      supabase.removeChannel(shopSubscription);
      shopSubscription = null;
    }
    if (window.showModeSelection) {
      window.showModeSelection();
    }
  });

  const backBtn = shopWrapper.querySelector('.back-to-home-btn');
  backBtn.addEventListener('click', () => {
    if (shopSubscription) {
      supabase.removeChannel(shopSubscription);
      shopSubscription = null;
    }
    if (window.showModeSelection) {
      window.showModeSelection();
    }
  });

  cartUI = createCartUI(cart, container);

  cartUI.checkoutBtn.addEventListener('click', () => {
    cartUI.cartModal.style.display = 'none';
    startCheckoutFlow(container, walletAdapter);
  });

  const gridContainer = shopWrapper.querySelector('.shop-grid');
  await loadTraits(gridContainer);

  shopSubscription = supabase
    .channel('shop-traits-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'shop_traits'
      },
      (payload) => {
        console.log('Shop trait updated:', payload);
        loadTraits(gridContainer);
      }
    )
    .subscribe();
}

async function loadTraits(gridContainer) {
  try {
    const { data: traits, error } = await supabase
      .from('shop_traits')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const walletAddress = walletAdapter?.publicKey?.toString();

    const traitsWithClaims = await Promise.all(traits.map(async (trait) => {
      if (trait.max_claims_per_wallet && walletAddress) {
        const { data: claimData } = await supabase
          .rpc('can_wallet_claim_trait', {
            p_wallet_address: walletAddress,
            p_trait_id: trait.id
          });

        if (claimData && claimData.length > 0) {
          return { ...trait, claimInfo: claimData[0] };
        }
      }
      return { ...trait, claimInfo: null };
    }));

    gridContainer.innerHTML = traitsWithClaims.map(trait => createTraitCard(trait)).join('');

    traitsWithClaims.forEach(trait => {
      const card = gridContainer.querySelector(`[data-trait-id="${trait.id}"]`);
      const addBtn = card.querySelector('.add-to-cart-btn');
      const isOutOfStock = trait.stock_quantity !== null && trait.stock_quantity <= 0;
      const isClaimLimitReached = trait.claimInfo && !trait.claimInfo.can_claim;

      const inCart = cart && cart.hasItem(trait.id);
      if (inCart) {
        updateCardState(card, addBtn, true, trait);
      }

      addBtn.addEventListener('click', async () => {
        if (isOutOfStock || isClaimLimitReached) return;

        if (cart.hasItem(trait.id)) {
          cart.removeItem(trait.id);
          updateCardState(card, addBtn, false, trait);
        } else {
          cart.addItem(trait);
          updateCardState(card, addBtn, true, trait);
        }
      });
    });

  } catch (error) {
    console.error('Error loading traits:', error);
    gridContainer.innerHTML = '<p style="color: white; text-align: center;">Error loading shop. Please try again.</p>';
  }
}

function createTraitCard(trait) {
  const isOutOfStock = trait.stock_quantity !== null && trait.stock_quantity <= 0;
  const isFree = trait.burn_cost === 0 && trait.sol_price === 0;
  const isClaimLimitReached = trait.claimInfo && !trait.claimInfo.can_claim;

  let stockDisplay = '';
  if (trait.stock_quantity === null) {
    stockDisplay = '';
  } else if (trait.stock_quantity <= 0) {
    stockDisplay = '<div class="stock-indicator sold-out">SOLD OUT</div>';
  } else if (trait.stock_quantity <= 5) {
    stockDisplay = `<div class="stock-indicator low-stock">${trait.stock_quantity} left!</div>`;
  } else {
    stockDisplay = `<div class="stock-indicator in-stock">${trait.stock_quantity} available</div>`;
  }

  let claimLimitDisplay = '';
  if (isFree && trait.max_claims_per_wallet) {
    if (trait.claimInfo) {
      if (trait.claimInfo.can_claim) {
        claimLimitDisplay = `<div class="claim-limit-info" style="background: rgba(34, 197, 94, 0.2); color: #22c55e; padding: 8px; border-radius: 6px; font-size: 13px; margin-top: 8px;">
          ✓ You can claim ${trait.claimInfo.claims_remaining} more
        </div>`;
      } else {
        claimLimitDisplay = `<div class="claim-limit-info" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 8px; border-radius: 6px; font-size: 13px; margin-top: 8px;">
          ⚠ Limit reached (${trait.claimInfo.max_claims} max)
        </div>`;
      }
    } else {
      claimLimitDisplay = `<div class="claim-limit-info" style="background: rgba(59, 130, 246, 0.2); color: #3b82f6; padding: 8px; border-radius: 6px; font-size: 13px; margin-top: 8px;">
        Limit: ${trait.max_claims_per_wallet} per wallet
      </div>`;
    }
  }

  let pricingDisplay = '';
  if (isFree) {
    pricingDisplay = `
      <div class="trait-pricing" style="text-align: center; padding: 16px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.2)); border-radius: 8px; margin: 12px 0;">
        <div style="font-size: 28px; font-weight: 800; color: #22c55e; text-shadow: 0 0 20px rgba(34, 197, 94, 0.5);">FREE</div>
        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-top: 4px;">No cost to claim!</div>
      </div>
    `;
  } else {
    pricingDisplay = `
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
    `;
  }

  let buttonText = 'Add to Cart';
  let buttonDisabled = false;
  if (isOutOfStock) {
    buttonText = 'Sold Out';
    buttonDisabled = true;
  } else if (isClaimLimitReached) {
    buttonText = 'Limit Reached';
    buttonDisabled = true;
  } else if (isFree) {
    buttonText = 'Claim Free';
  }

  const cardClass = `shop-trait-card ${isOutOfStock || isClaimLimitReached ? 'out-of-stock' : ''} ${isFree ? 'free-item' : ''}`;

  return `
    <div class="${cardClass}" data-trait-id="${trait.id}">
      <div class="trait-image-container">
        ${isFree ? '<div class="free-badge" style="position: absolute; top: 10px; right: 10px; background: linear-gradient(135deg, #22c55e, #10b981); color: white; padding: 6px 12px; border-radius: 20px; font-weight: 700; font-size: 13px; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);">FREE!</div>' : ''}
        <img src="${trait.image_url}" alt="${trait.name}">
        ${stockDisplay}
      </div>
      <div class="trait-info">
        <h3 class="trait-name">${trait.name}</h3>
        <p class="trait-category">${trait.category}</p>
        ${pricingDisplay}
        ${claimLimitDisplay}
        <button class="add-to-cart-btn" ${buttonDisabled ? 'disabled' : ''}>${buttonText}</button>
      </div>
    </div>
  `;
}

function updateCardState(card, button, inCart, trait) {
  const isFree = trait && trait.burn_cost === 0 && trait.sol_price === 0;

  if (inCart) {
    card.classList.add('in-cart');
    button.classList.add('in-cart');
    button.textContent = 'In Cart ✓';
  } else {
    card.classList.remove('in-cart');
    button.classList.remove('in-cart');
    button.textContent = isFree ? 'Claim Free' : 'Add to Cart';
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
  const allItemsFree = items.every(item => item.burn_cost === 0 && item.sol_price === 0);

  if (allItemsFree) {
    showOrderConfirmation(container, walletAdapter, 'free');
    return;
  }

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

  if (paymentMethod === 'free') {
    totalCost = 0;
    paymentDetails = `
      <div class="payment-breakdown">
        <h3 style="color: #22c55e;">Free Claim - No Payment Required</h3>
        <div style="background: rgba(34, 197, 94, 0.1); border: 2px solid rgba(34, 197, 94, 0.3); border-radius: 12px; padding: 20px; margin: 16px 0;">
          <div style="text-align: center; margin-bottom: 12px;">
            <div style="font-size: 48px; margin-bottom: 8px;">🎉</div>
            <div style="font-size: 20px; font-weight: 700; color: #22c55e; margin-bottom: 8px;">Completely FREE!</div>
            <div style="font-size: 14px; color: rgba(255, 255, 255, 0.7);">
              No SOL payment • No NFT burn • Just claim and enjoy!
            </div>
          </div>
          <div class="fee-breakdown" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
            <div class="fee-row total" style="justify-content: center;">
              <span style="font-size: 18px; color: #22c55e;">You Pay:</span>
              <span style="font-size: 24px; font-weight: 800; color: #22c55e;">0 SOL</span>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (paymentMethod === 'burn') {
    totalCost = config.reimbursementSOL;
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
          <div class="fee-row total">
            <span>Total Fees:</span>
            <span>${totalCost.toFixed(4)} SOL</span>
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
        <button class="btn-primary checkout-confirm">${paymentMethod === 'free' ? 'Claim Free Trait' : 'Confirm Purchase'}</button>
      </div>
    </div>
  `;

  const backBtn = container.querySelector('.checkout-back');
  const confirmBtn = container.querySelector('.checkout-confirm');

  backBtn.addEventListener('click', () => {
    if (paymentMethod === 'free') {
      showTargetSelection(container, walletAdapter);
    } else if (paymentMethod === 'burn') {
      showBurnSelection(container, walletAdapter);
    } else {
      showPaymentSelection(container, walletAdapter);
    }
  });

  confirmBtn.addEventListener('click', () => {
    processTransaction(container, walletAdapter, paymentMethod, totalCost);
  });
}

async function validateStockAvailability() {
  const items = cart.getItems();
  const outOfStockItems = [];

  for (const item of items) {
    const { data, error } = await supabase
      .rpc('check_trait_stock', { trait_uuid: item.id });

    if (error) {
      console.error('Stock check error:', error);
      return {
        success: false,
        message: 'Failed to verify stock availability. Please try again.'
      };
    }

    if (data && data.length > 0) {
      const stockInfo = data[0];
      if (!stockInfo.available) {
        outOfStockItems.push(stockInfo.trait_name);
      }
    }
  }

  if (outOfStockItems.length > 0) {
    const itemsList = outOfStockItems.join(', ');
    return {
      success: false,
      message: `The following items are out of stock: ${itemsList}. Please remove them from your cart and try again.`
    };
  }

  return { success: true };
}

async function processTransaction(container, walletAdapter, paymentMethod, totalCost) {
  try {
    const stockValidation = await validateStockAvailability();
    if (!stockValidation.success) {
      showFailureScreen(container, walletAdapter, stockValidation.message);
      return;
    }
  } catch (error) {
    console.error('Stock validation error:', error);
    showFailureScreen(container, walletAdapter, 'Failed to validate stock availability. Please try again.');
    return;
  }

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

    if (paymentMethod === 'free') {
      transactionSignature = 'FREE_CLAIM_' + Date.now();
    } else if (paymentMethod === 'burn') {
      transactionSignature = await processBurnPayment(selectedBurnNFTs, walletAdapter);
    } else {
      transactionSignature = await processSOLPayment(totalCost, walletAdapter);
    }

    updateProgressStep(container, 2);

    await applyTraitsToNFT(selectedTargetNFT, cart.getItems());

    updateProgressStep(container, 3);

    await recordPurchase(paymentMethod, transactionSignature, walletAdapter);

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

  let firstSignature = '';

  for (let i = 0; i < nftsToBurn.length; i++) {
    const nft = nftsToBurn[i];
    const nftName = nft.name || 'Trap Star';
    const signature = await transferNFT(
      walletAdapter,
      nft.mint,
      collectionWallet,
      collectionAddress,
      `Transferring ${nftName} to Burn Wallet - Shop Purchase`
    );

    if (i === 0) {
      firstSignature = signature;
    }
  }

  await transferSOL(
    walletAdapter,
    reimbursementWallet,
    reimbursementFee,
    'Shop Processing Fee - 0.05 SOL'
  );

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

  const items = cart.getItems();
  const itemNames = items.map(item => item.name).join(', ');
  const purchaseMemo = `Shop Purchase: ${itemNames}`;

  const collectionSignature = await transferSOL(
    walletAdapter,
    collectionWallet,
    collectionAmount,
    purchaseMemo
  );

  await transferSOL(
    walletAdapter,
    reimbursementWallet,
    reimbursementFee,
    'Shop Processing Fee - 0.05 SOL'
  );

  return collectionSignature;
}

async function applyTraitsToNFT(targetNFT, items) {
  const { updateNFTMetadata } = await import('./blockchain.js');

  console.log('🛒 Processing cart with', items.length, 'items');
  console.log('🎯 Target NFT mint:', targetNFT?.mint || targetNFT?.id);

  const nftMint = targetNFT.mint || targetNFT.id;
  if (!nftMint) {
    throw new Error('Cannot find NFT mint address. NFT object is missing both mint and id properties.');
  }

  const existingTraits = targetNFT.content?.metadata?.attributes || targetNFT.attributes || [];
  console.log('📋 Initial traits:', existingTraits);

  const mergedTraits = [...existingTraits];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const newTrait = {
      trait_type: item.category,
      value: item.trait_value || item.name
    };

    console.log(`🔄 Merging cart item ${i + 1}/${items.length}: ${newTrait.trait_type} → ${newTrait.value}`);

    const existingIndex = mergedTraits.findIndex(t =>
      t.trait_type.toLowerCase() === newTrait.trait_type.toLowerCase()
    );

    if (existingIndex !== -1) {
      mergedTraits[existingIndex] = {
        trait_type: newTrait.trait_type,
        value: newTrait.value
      };
    } else {
      mergedTraits.push(newTrait);
    }
  }

  console.log('✅ Final merged traits:', mergedTraits);

  const logoTrait = mergedTraits.find(t => t.trait_type.toLowerCase() === 'logo');
  const useNewLogo = logoTrait && logoTrait.value.toLowerCase() === 'uzi';
  console.log('🎨 Logo detection: Using new logo =', useNewLogo);

  const logoOptions = {};
  if (useNewLogo) {
    logoOptions.logoUrl = 'https://trapstars-assets.netlify.app/logo/new%20logo.png';
    logoOptions.useNewLogo = true;
  }

  console.log('📸 Generating composite image with', mergedTraits.length, 'traits');
  const imageBlob = await window.generateImageFromTraits(mergedTraits, logoOptions);

  const reader = new FileReader();
  const imageDataUrl = await new Promise((resolve, reject) => {
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(imageBlob);
  });

  console.log('📤 Calling edge function in BATCH mode');
  await updateNFTMetadata(
    nftMint,
    null,
    null,
    imageDataUrl,
    useNewLogo,
    mergedTraits
  );

  console.log('✅ Metadata update complete');
}

async function recordPurchase(paymentMethod, transactionSignature, walletAdapter) {
  const items = cart.getItems();
  const walletAddress = walletAdapter?.publicKey?.toString() || 'unknown';

  const reimbursementFee = parseFloat(import.meta.env.VITE_REIMBURSEMENT_FEE);
  const serviceFee = parseFloat(import.meta.env.VITE_SERVICE_FEE);
  const totalFees = reimbursementFee + serviceFee;

  let solAmount = 0;
  if (paymentMethod === 'free') {
    solAmount = 0;
  } else if (paymentMethod === 'burn') {
    solAmount = totalFees;
  } else {
    solAmount = cart.getTotalSOLPrice() + totalFees;
  }

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
          <div class="success-note" style="margin-top: 20px; padding: 15px; background: rgba(255, 255, 255, 0.1); border-radius: 8px; font-size: 14px; line-height: 1.6;">
            <p style="margin: 0; color: #fbbf24;"><strong>⏱️ Please Note:</strong></p>
            <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.9);">Your updated Trap Star may take up to 15 minutes to appear on Magic Eden and reflect on-chain. The blockchain needs time to process and index the metadata updates.</p>
          </div>
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
      mint: nft.mint,
      name: nft.name || 'Trap Star',
      image: nft.image,
      cached_image_uri: nft.cached_image_uri,
      attributes: nft.attributes || [],
      content: nft.content,
      rawData: nft.rawData
    }));
  }
  return [];
}
