export class ShoppingCart {
  constructor() {
    this.items = [];
    this.listeners = [];
  }

  addItem(trait) {
    const existingIndex = this.items.findIndex(item => item.id === trait.id);
    if (existingIndex === -1) {
      this.items.push(trait);
      this.notifyListeners();
      return true;
    }
    return false;
  }

  removeItem(traitId) {
    const initialLength = this.items.length;
    this.items = this.items.filter(item => item.id !== traitId);
    if (this.items.length !== initialLength) {
      this.notifyListeners();
      return true;
    }
    return false;
  }

  clear() {
    this.items = [];
    this.notifyListeners();
  }

  getItems() {
    return [...this.items];
  }

  getItemCount() {
    return this.items.length;
  }

  getTotalBurnCost() {
    return this.items.reduce((sum, item) => sum + item.burn_cost, 0);
  }

  getTotalSOLPrice() {
    return this.items.reduce((sum, item) => sum + parseFloat(item.sol_price), 0);
  }

  hasItem(traitId) {
    return this.items.some(item => item.id === traitId);
  }

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  notifyListeners() {
    this.listeners.forEach(callback => callback(this.items));
  }
}

export function createCartUI(cart, container) {
  const cartButton = document.createElement('button');
  cartButton.className = 'cart-button';
  cartButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="9" cy="21" r="1"></circle>
      <circle cx="20" cy="21" r="1"></circle>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
    </svg>
    <span class="cart-count">0</span>
  `;

  const cartModal = document.createElement('div');
  cartModal.className = 'cart-modal';
  cartModal.style.display = 'none';
  cartModal.innerHTML = `
    <div class="cart-modal-content">
      <div class="cart-modal-header">
        <h2>Shopping Cart</h2>
        <button class="cart-close-btn">×</button>
      </div>
      <div class="cart-items-list"></div>
      <div class="cart-footer">
        <div class="cart-totals">
          <div class="cart-total-row">
            <span>Total Burn Cost:</span>
            <span class="cart-burn-total">0 Trap Stars</span>
          </div>
          <div class="cart-total-row">
            <span>Or Pay:</span>
            <span class="cart-sol-total">0 SOL</span>
          </div>
        </div>
        <button class="cart-checkout-btn" disabled>Proceed to Checkout</button>
      </div>
    </div>
  `;

  container.appendChild(cartButton);
  container.appendChild(cartModal);

  const countBadge = cartButton.querySelector('.cart-count');
  const itemsList = cartModal.querySelector('.cart-items-list');
  const burnTotal = cartModal.querySelector('.cart-burn-total');
  const solTotal = cartModal.querySelector('.cart-sol-total');
  const checkoutBtn = cartModal.querySelector('.cart-checkout-btn');
  const closeBtn = cartModal.querySelector('.cart-close-btn');

  function updateCartDisplay() {
    const items = cart.getItems();
    const count = cart.getItemCount();

    countBadge.textContent = count;
    countBadge.style.display = count > 0 ? 'flex' : 'none';

    if (count === 0) {
      itemsList.innerHTML = '<div class="cart-empty">Your cart is empty</div>';
      checkoutBtn.disabled = true;
    } else {
      itemsList.innerHTML = items.map(item => `
        <div class="cart-item" data-id="${item.id}">
          <img src="${item.image_url}" alt="${item.name}">
          <div class="cart-item-details">
            <h3>${item.name}</h3>
            <p>${item.category}</p>
            <p class="cart-item-price">Burn ${item.burn_cost} or ${item.sol_price} SOL</p>
          </div>
          <button class="cart-item-remove" data-id="${item.id}">×</button>
        </div>
      `).join('');
      checkoutBtn.disabled = false;
    }

    burnTotal.textContent = `${cart.getTotalBurnCost()} Trap Star${cart.getTotalBurnCost() !== 1 ? 's' : ''}`;
    solTotal.textContent = `${cart.getTotalSOLPrice().toFixed(2)} SOL`;

    const removeButtons = itemsList.querySelectorAll('.cart-item-remove');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        cart.removeItem(btn.dataset.id);
      });
    });
  }

  cartButton.addEventListener('click', () => {
    cartModal.style.display = 'flex';
  });

  closeBtn.addEventListener('click', () => {
    cartModal.style.display = 'none';
  });

  cartModal.addEventListener('click', (e) => {
    if (e.target === cartModal) {
      cartModal.style.display = 'none';
    }
  });

  cart.subscribe(updateCartDisplay);
  updateCartDisplay();

  return { cartButton, cartModal, checkoutBtn };
}
