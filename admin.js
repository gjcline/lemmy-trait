import './shader-background.js';
import { detectWallets, setWalletProvider, clearWalletProvider, getWalletProvider, WALLET_TYPES } from './wallet-provider.js';

// Helper function to normalize IPFS URLs to use ipfs.io gateway
function normalizeIPFSUrl(url) {
    if (!url || typeof url !== 'string') return url;

    // Extract IPFS hash from various formats
    const ipfsHashMatch = url.match(/(?:ipfs:\/\/|\/ipfs\/|gateway\.pinata\.cloud\/ipfs\/|cloudflare-ipfs\.com\/ipfs\/|dweb\.link\/ipfs\/|nftstorage\.link\/ipfs\/|w3s\.link\/ipfs\/)([a-zA-Z0-9]+)/);

    if (ipfsHashMatch && ipfsHashMatch[1]) {
        const hash = ipfsHashMatch[1];
        return `https://ipfs.io/ipfs/${hash}`;
    }

    return url;
}

const ADMIN_WALLETS = [
    import.meta.env.VITE_ADMIN_WALLET_1,
    import.meta.env.VITE_ADMIN_WALLET_2
].filter(Boolean);

console.log('Admin wallets configured:', ADMIN_WALLETS.length);
console.log('Environment check:', {
    hasWallet1: !!import.meta.env.VITE_ADMIN_WALLET_1,
    hasWallet2: !!import.meta.env.VITE_ADMIN_WALLET_2
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let wallet = null;
let supabase = null;
let currentPage = 1;
let pageSize = 20;
let filters = {
    status: '',
    dateRange: 'today',
    search: ''
};
let allTransactions = [];
let realtimeChannel = null;

let shopTransactionsPage = 1;
let shopTransactionsPageSize = 20;
let shopTransactionsFilters = {
    paymentMethod: '',
    status: '',
    dateRange: 'all',
    search: ''
};
let allShopTransactions = [];
let shopRealtimeChannel = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function showToast(message, submessage = '', icon = '✅') {
    const toast = document.getElementById('toast');
    document.getElementById('toastIcon').textContent = icon;
    document.getElementById('toastMessage').textContent = message;
    document.getElementById('toastSubmessage').textContent = submessage;

    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 4000);
}

function formatAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatSOL(amount) {
    return `${parseFloat(amount).toFixed(4)} SOL`;
}

function getStatusBadge(status) {
    const statusClass = status === 'completed' ? 'completed' :
                       status === 'failed' ? 'failed' : 'pending';
    const icon = status === 'completed' ? '✅' :
                status === 'failed' ? '❌' : '⏳';

    return `<span class="status-badge ${statusClass}">
        <span>${icon}</span>
        <span>${status}</span>
    </span>`;
}

function getSolscanLink(signature) {
    if (!signature || signature === '') return '<span class="text-gray-500 text-xs">N/A</span>';
    return `<a href="https://solscan.io/tx/${signature}" target="_blank" class="signature-link">
        View on Solscan →
    </a>`;
}

async function connectWallet() {
    try {
        const availableWallets = detectWallets();

        if (availableWallets.length === 0) {
            alert('No wallet detected!\n\nPlease install Phantom or SolFlare wallet.');
            return;
        }

        const provider = availableWallets[0].provider;
        const walletType = availableWallets[0].type;

        const response = await provider.connect();
        wallet = response.publicKey.toString();

        setWalletProvider(walletType, provider);

        console.log('Connected wallet:', wallet);
        console.log('Checking against admin wallets:', ADMIN_WALLETS);
        console.log('Is admin?', ADMIN_WALLETS.includes(wallet));

        if (ADMIN_WALLETS.length === 0) {
            alert('Admin wallets not configured! Check Netlify environment variables.');
            wallet = null;
            return;
        }

        if (!ADMIN_WALLETS.includes(wallet)) {
            document.getElementById('deniedWallet').textContent = wallet;
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('accessDeniedScreen').classList.remove('hidden');
            wallet = null;
            return;
        }

        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        document.getElementById('adminWalletAddress').textContent = formatAddress(wallet);

        await loadTransactions();
        setupRealtimeSubscription();
        setupShopTransactionsRealtimeSubscription();
        setupEventListeners();
        setupShopTransactionsEventListeners();
    } catch (error) {
        console.error('Wallet connection error:', error);
        showToast('Failed to connect wallet', error.message, '❌');
    }
}

function disconnectWallet() {
    const provider = getWalletProvider();
    if (provider) {
        provider.disconnect();
    }
    clearWalletProvider();
    wallet = null;

    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }

    if (shopRealtimeChannel) {
        supabase.removeChannel(shopRealtimeChannel);
        shopRealtimeChannel = null;
    }

    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
}

function setupRealtimeSubscription() {
    if (!supabase) return;

    realtimeChannel = supabase
        .channel('swap_transactions_changes')
        .on('postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'swap_transactions'
            },
            (payload) => {
                console.log('Real-time update:', payload);

                if (payload.eventType === 'INSERT') {
                    showToast('New Transaction', 'A new transaction has been created', '📊');
                } else if (payload.eventType === 'UPDATE') {
                    if (payload.new.status === 'failed') {
                        showToast('Transaction Failed', `Transaction ${payload.new.id.substring(0, 8)} failed`, '⚠️');
                    } else if (payload.new.status === 'completed') {
                        showToast('Transaction Completed', `Transaction ${payload.new.id.substring(0, 8)} completed`, '✅');
                    }
                }

                loadTransactions();
            }
        )
        .subscribe();
}

async function loadTransactions() {
    if (!supabase) {
        console.error('Supabase not configured');
        return;
    }

    try {
        let query = supabase
            .from('swap_transactions')
            .select('*')
            .order('created_at', { ascending: false });

        if (filters.status) {
            query = query.eq('status', filters.status);
        }

        if (filters.dateRange !== 'all') {
            const now = new Date();
            let startDate;

            if (filters.dateRange === 'today') {
                startDate = new Date(now.setHours(0, 0, 0, 0));
            } else if (filters.dateRange === 'week') {
                startDate = new Date(now.setDate(now.getDate() - 7));
            } else if (filters.dateRange === 'month') {
                startDate = new Date(now.setDate(now.getDate() - 30));
            }

            query = query.gte('created_at', startDate.toISOString());
        }

        const { data, error } = await query;

        if (error) throw error;

        allTransactions = data || [];

        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            allTransactions = allTransactions.filter(tx =>
                tx.wallet_address?.toLowerCase().includes(searchLower) ||
                tx.donor_mint?.toLowerCase().includes(searchLower) ||
                tx.recipient_mint?.toLowerCase().includes(searchLower) ||
                tx.id?.toLowerCase().includes(searchLower)
            );
        }

        updateStats();
        renderTransactions();
    } catch (error) {
        console.error('Error loading transactions:', error);
        showToast('Error Loading Data', error.message, '❌');
    }
}

function updateStats() {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    const todayTx = allTransactions.filter(tx =>
        new Date(tx.created_at) >= todayStart
    );

    const completedTx = allTransactions.filter(tx => tx.status === 'completed');
    const failedTx = allTransactions.filter(tx => tx.status === 'failed');

    const successRate = allTransactions.length > 0
        ? Math.round((completedTx.length / allTransactions.length) * 100)
        : 0;

    const totalFees = completedTx.reduce((sum, tx) =>
        sum + (parseFloat(tx.service_fee_amount) || 0), 0
    );

    document.getElementById('statsToday').textContent = todayTx.length;
    document.getElementById('statsSuccessRate').textContent = `${successRate}%`;
    document.getElementById('statsFailed').textContent = failedTx.length;
    document.getElementById('statsTotalFees').textContent = formatSOL(totalFees);
}

function renderTransactions() {
    const tbody = document.getElementById('transactionsTableBody');
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageTransactions = allTransactions.slice(start, end);

    if (pageTransactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-gray-400">
                    No transactions found
                </td>
            </tr>
        `;
        updatePagination();
        return;
    }

    tbody.innerHTML = pageTransactions.map(tx => `
        <tr class="hover:bg-white/5 cursor-pointer" onclick="showTransactionDetail('${tx.id}')">
            <td class="p-4">
                ${getStatusBadge(tx.status)}
            </td>
            <td class="p-4">
                <div class="text-sm text-white">${formatDate(tx.created_at)}</div>
                ${tx.completed_at ? `<div class="text-xs text-gray-500 mt-1">Completed: ${formatDate(tx.completed_at)}</div>` : ''}
            </td>
            <td class="p-4">
                <div class="font-mono text-sm">${formatAddress(tx.wallet_address)}</div>
                <button class="copy-btn mt-1" onclick="event.stopPropagation(); copyToClipboard('${tx.wallet_address}', this)">
                    Copy
                </button>
            </td>
            <td class="p-4">
                <div class="text-sm text-white">${tx.swapped_trait_category}: <span class="text-gray-400">${tx.swapped_trait_value}</span></div>
                <div class="text-xs text-gray-500 mt-1">
                    ${tx.donor_name ? `From: ${tx.donor_name}` : ''}
                </div>
            </td>
            <td class="p-4">
                <div class="text-sm text-white font-semibold">${formatSOL(tx.total_paid_by_user || tx.cost_sol || 0)}</div>
                <div class="text-xs text-gray-500 mt-1">
                    Fee: ${formatSOL(tx.service_fee_amount || 0)}
                </div>
            </td>
            <td class="p-4">
                <button class="btn-secondary px-3 py-1.5 rounded text-xs" onclick="event.stopPropagation(); showTransactionDetail('${tx.id}')">
                    View Details
                </button>
            </td>
        </tr>
    `).join('');

    updatePagination();
}

function updatePagination() {
    const total = allTransactions.length;
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);

    document.getElementById('pageInfo').textContent = `${start}-${end} of ${total}`;

    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = end >= total;
}

window.showTransactionDetail = async function(transactionId) {
    const tx = allTransactions.find(t => t.id === transactionId);
    if (!tx) return;

    const modal = document.getElementById('detailModal');
    const content = document.getElementById('modalContent');

    const stepIndicators = [
        { name: 'Service Fee', signature: tx.service_fee_signature, amount: tx.service_fee_amount },
        { name: 'Reimbursement', signature: tx.reimbursement_signature, amount: tx.reimbursement_amount },
        { name: 'NFT Burn', signature: tx.burn_signature, amount: null },
        { name: 'Metadata Update', signature: tx.update_signature, amount: null }
    ];

    content.innerHTML = `
        <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                    <h3 class="text-lg font-semibold border-b border-white/10 pb-2">Transaction Info</h3>
                    <div class="info-row">
                        <div class="info-label">Transaction ID</div>
                        <div class="info-value font-mono text-xs">${tx.id}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Status</div>
                        <div class="info-value">${getStatusBadge(tx.status)}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Wallet</div>
                        <div class="info-value font-mono text-xs">${tx.wallet_address}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Created</div>
                        <div class="info-value">${formatDate(tx.created_at)}</div>
                    </div>
                    ${tx.completed_at ? `
                    <div class="info-row">
                        <div class="info-label">Completed</div>
                        <div class="info-value">${formatDate(tx.completed_at)}</div>
                    </div>` : ''}
                    ${tx.failed_step ? `
                    <div class="info-row">
                        <div class="info-label">Failed Step</div>
                        <div class="info-value text-red-400">Step ${tx.failed_step}: ${stepIndicators[tx.failed_step - 1]?.name}</div>
                    </div>` : ''}
                    ${tx.error_message ? `
                    <div class="info-row">
                        <div class="info-label">Error</div>
                        <div class="info-value text-red-400 text-xs">${tx.error_message}</div>
                    </div>` : ''}
                </div>

                <div class="space-y-4">
                    <h3 class="text-lg font-semibold border-b border-white/10 pb-2">NFT Details</h3>
                    <div class="info-row">
                        <div class="info-label">Donor NFT</div>
                        <div class="info-value">
                            <div class="font-semibold">${tx.donor_name || 'Unknown'}</div>
                            <div class="font-mono text-xs text-gray-400">${formatAddress(tx.donor_mint)}</div>
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Recipient NFT</div>
                        <div class="info-value">
                            <div class="font-semibold">${tx.recipient_name || 'Unknown'}</div>
                            <div class="font-mono text-xs text-gray-400">${formatAddress(tx.recipient_mint)}</div>
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Trait Swapped</div>
                        <div class="info-value">
                            <span class="font-semibold">${tx.swapped_trait_category}:</span> ${tx.swapped_trait_value}
                        </div>
                    </div>
                    ${tx.new_image_url ? `
                    <div class="info-row">
                        <div class="info-label">New Image</div>
                        <div class="info-value">
                            <a href="${normalizeIPFSUrl(tx.new_image_url)}" target="_blank" class="signature-link">View on IPFS →</a>
                        </div>
                    </div>` : ''}
                    ${tx.new_metadata_url ? `
                    <div class="info-row">
                        <div class="info-label">New Metadata</div>
                        <div class="info-value">
                            <a href="${normalizeIPFSUrl(tx.new_metadata_url)}" target="_blank" class="signature-link">View on IPFS →</a>
                        </div>
                    </div>` : ''}
                </div>
            </div>

            <div>
                <h3 class="text-lg font-semibold border-b border-white/10 pb-2 mb-4">Transaction Steps</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    ${stepIndicators.map((step, index) => `
                        <div class="step-indicator ${step.signature && step.signature !== '' ? 'success' : (tx.failed_step === index + 1 ? 'error' : '')}">
                            <span class="font-semibold">${index + 1}. ${step.name}</span>
                            ${step.amount ? `<span class="text-xs ml-auto">${formatSOL(step.amount)}</span>` : ''}
                            ${step.signature && step.signature !== '' ? '<span class="ml-auto">✅</span>' : (tx.failed_step === index + 1 ? '<span class="ml-auto">❌</span>' : '<span class="ml-auto text-gray-500">⏳</span>')}
                        </div>
                        ${step.signature && step.signature !== '' ? `
                        <div class="col-span-1 md:col-span-2">
                            ${getSolscanLink(step.signature)}
                        </div>` : ''}
                    `).join('')}
                </div>
            </div>

            <div>
                <h3 class="text-lg font-semibold border-b border-white/10 pb-2 mb-4">Cost Breakdown</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="glass rounded-lg p-4">
                        <p class="text-xs text-gray-400 mb-1">Service Fee</p>
                        <p class="text-lg font-bold">${formatSOL(tx.service_fee_amount || 0)}</p>
                    </div>
                    <div class="glass rounded-lg p-4">
                        <p class="text-xs text-gray-400 mb-1">Reimbursement</p>
                        <p class="text-lg font-bold">${formatSOL(tx.reimbursement_amount || 0)}</p>
                    </div>
                    <div class="glass rounded-lg p-4">
                        <p class="text-xs text-gray-400 mb-1">Total Paid</p>
                        <p class="text-lg font-bold text-green-400">${formatSOL(tx.total_paid_by_user || tx.cost_sol || 0)}</p>
                    </div>
                    <div class="glass rounded-lg p-4">
                        <p class="text-xs text-gray-400 mb-1">Status</p>
                        ${getStatusBadge(tx.status)}
                    </div>
                </div>
            </div>

            <div>
                <h3 class="text-lg font-semibold border-b border-white/10 pb-2 mb-4">Admin Notes</h3>
                <textarea id="adminNotesInput" class="notes-textarea" placeholder="Add notes about this transaction...">${tx.admin_notes || ''}</textarea>
                <button class="btn-primary px-4 py-2 rounded-lg mt-2" onclick="saveAdminNotes('${tx.id}')">
                    Save Notes
                </button>
            </div>

            <div class="flex gap-3">
                <button class="btn-secondary px-4 py-2 rounded-lg flex-1" onclick="exportTransactionCSV('${tx.id}')">
                    Export as CSV
                </button>
                <button class="btn-secondary px-4 py-2 rounded-lg flex-1" onclick="copyTransactionDetails('${tx.id}')">
                    Copy Details
                </button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
};

window.saveAdminNotes = async function(transactionId) {
    if (!supabase) return;

    const notes = document.getElementById('adminNotesInput').value;

    try {
        const { error } = await supabase
            .from('swap_transactions')
            .update({ admin_notes: notes })
            .eq('id', transactionId);

        if (error) throw error;

        showToast('Notes Saved', 'Admin notes updated successfully', '✅');
        await loadTransactions();
    } catch (error) {
        console.error('Error saving notes:', error);
        showToast('Error', 'Failed to save notes', '❌');
    }
};

window.copyToClipboard = function(text, button) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.classList.add('copied');
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    });
};

window.copyTransactionDetails = function(transactionId) {
    const tx = allTransactions.find(t => t.id === transactionId);
    if (!tx) return;

    const details = `Transaction ID: ${tx.id}
Status: ${tx.status}
Wallet: ${tx.wallet_address}
Created: ${formatDate(tx.created_at)}
Donor NFT: ${tx.donor_name} (${tx.donor_mint})
Recipient NFT: ${tx.recipient_name} (${tx.recipient_mint})
Trait: ${tx.swapped_trait_category} - ${tx.swapped_trait_value}
Cost: ${formatSOL(tx.total_paid_by_user || tx.cost_sol || 0)}
${tx.service_fee_signature ? `Service Fee Sig: ${tx.service_fee_signature}` : ''}
${tx.reimbursement_signature ? `Reimbursement Sig: ${tx.reimbursement_signature}` : ''}
${tx.burn_signature ? `Burn Sig: ${tx.burn_signature}` : ''}
${tx.update_signature ? `Update Sig: ${tx.update_signature}` : ''}`;

    navigator.clipboard.writeText(details).then(() => {
        showToast('Copied!', 'Transaction details copied to clipboard', '📋');
    });
};

window.exportTransactionCSV = function(transactionId) {
    const tx = allTransactions.find(t => t.id === transactionId);
    if (!tx) return;

    const csv = `Transaction ID,Status,Wallet,Created,Donor NFT,Recipient NFT,Trait Category,Trait Value,Cost,Service Fee Sig,Reimbursement Sig,Burn Sig,Update Sig
${tx.id},${tx.status},${tx.wallet_address},${tx.created_at},${tx.donor_mint},${tx.recipient_mint},${tx.swapped_trait_category},${tx.swapped_trait_value},${tx.total_paid_by_user || tx.cost_sol || 0},${tx.service_fee_signature || ''},${tx.reimbursement_signature || ''},${tx.burn_signature || ''},${tx.update_signature || ''}`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transaction-${tx.id.substring(0, 8)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showToast('Exported!', 'Transaction exported as CSV', '📥');
};

function setupEventListeners() {
    document.getElementById('adminLogoutBtn').addEventListener('click', disconnectWallet);

    document.getElementById('closeModalBtn').addEventListener('click', () => {
        document.getElementById('detailModal').classList.add('hidden');
    });

    document.getElementById('filterStatus').addEventListener('change', (e) => {
        filters.status = e.target.value;
        currentPage = 1;
        loadTransactions();
    });

    document.getElementById('filterDateRange').addEventListener('change', (e) => {
        filters.dateRange = e.target.value;
        currentPage = 1;
        loadTransactions();
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
        filters.search = e.target.value;
        currentPage = 1;
        setTimeout(() => loadTransactions(), 300);
    });

    document.getElementById('failedOnlyBtn').addEventListener('click', () => {
        filters.status = 'failed';
        document.getElementById('filterStatus').value = 'failed';
        currentPage = 1;
        loadTransactions();
    });

    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTransactions();
        }
    });

    document.getElementById('nextPageBtn').addEventListener('click', () => {
        const maxPage = Math.ceil(allTransactions.length / pageSize);
        if (currentPage < maxPage) {
            currentPage++;
            renderTransactions();
        }
    });
}

function switchTab(tabName) {
    document.getElementById('transactionsSection').classList.toggle('hidden', tabName !== 'transactions');
    document.getElementById('shopTransactionsSection').classList.toggle('hidden', tabName !== 'shopTransactions');
    document.getElementById('shopSection').classList.toggle('hidden', tabName !== 'shop');

    document.getElementById('tabTransactions').classList.toggle('active', tabName === 'transactions');
    document.getElementById('tabShopTransactions').classList.toggle('active', tabName === 'shopTransactions');
    document.getElementById('tabShop').classList.toggle('active', tabName === 'shop');

    if (tabName === 'shop') {
        loadShopData();
    } else if (tabName === 'shopTransactions') {
        loadShopTransactions();
    }
}

async function loadShopData() {
    if (!supabase) return;

    try {
        await Promise.all([
            loadShopStats(),
            loadShopTraits(),
            loadShopPurchases()
        ]);
    } catch (error) {
        console.error('Error loading shop data:', error);
    }
}

async function loadShopStats() {
    try {
        const { data: purchases, error } = await supabase
            .from('trait_purchases')
            .select('*');

        if (error) throw error;

        const totalSales = purchases.length;
        const totalBurned = purchases.reduce((sum, p) => sum + p.nfts_burned_count, 0);
        const totalRevenue = purchases.reduce((sum, p) => sum + parseFloat(p.sol_amount || 0), 0);

        document.getElementById('shopStatsTotalSales').textContent = totalSales;
        document.getElementById('shopStatsBurned').textContent = totalBurned;
        document.getElementById('shopStatsRevenue').textContent = `${totalRevenue.toFixed(4)} SOL`;
    } catch (error) {
        console.error('Error loading shop stats:', error);
    }
}

async function loadShopTraits() {
    try {
        const { data: traits, error } = await supabase
            .from('shop_traits')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById('traitsTableBody');
        if (traits.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-gray-400">No traits found</td></tr>';
            return;
        }

        tbody.innerHTML = traits.map(trait => `
            <tr>
                <td class="p-4">
                    <img src="${trait.image_url}" alt="${trait.name}" class="w-16 h-16 object-cover rounded-lg">
                </td>
                <td class="p-4">
                    <div class="font-medium">${trait.name}</div>
                    <div class="text-xs text-gray-500 mt-1">Value: ${trait.trait_value || trait.name}</div>
                    ${trait.max_claims_per_wallet ? `
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-xs text-blue-400">Max: ${trait.max_claims_per_wallet}/wallet</span>
                            <button onclick="editMaxClaimsPerWallet('${trait.id}', ${trait.max_claims_per_wallet})"
                                class="text-blue-400 hover:text-blue-300 text-xs" title="Edit max claims per wallet">
                                ✏️
                            </button>
                        </div>
                    ` : ''}
                </td>
                <td class="p-4"><span class="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">${trait.category}</span></td>
                <td class="p-4">${trait.burn_cost === 0 && trait.sol_price === 0 ? '<span class="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 font-bold">FREE</span>' : `${trait.burn_cost} NFT${trait.burn_cost !== 1 ? 's' : ''}`}</td>
                <td class="p-4">${trait.burn_cost === 0 && trait.sol_price === 0 ? '<span class="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 font-bold">FREE</span>' : `${trait.sol_price} SOL`}</td>
                <td class="p-4">
                    <div class="flex items-center gap-2">
                        <span class="font-medium ${trait.stock_quantity !== null && trait.stock_quantity <= 5 ? 'text-orange-400' : 'text-gray-300'}">
                            ${trait.stock_quantity !== null ? trait.stock_quantity : '∞'}
                        </span>
                        <button onclick="editTraitStock('${trait.id}', ${trait.stock_quantity})"
                            class="text-blue-400 hover:text-blue-300 text-xs" title="Edit stock">
                            ✏️
                        </button>
                    </div>
                </td>
                <td class="p-4">
                    ${trait.is_active ?
                        '<span class="status-badge completed"><span>✅</span><span>Active</span></span>' :
                        '<span class="status-badge pending"><span>⏸️</span><span>Inactive</span></span>'}
                </td>
                <td class="p-4">
                    <button onclick="toggleTraitStatus('${trait.id}', ${!trait.is_active})"
                        class="btn-secondary px-3 py-1 rounded text-xs mr-2">
                        ${trait.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading shop traits:', error);
    }
}

async function loadShopPurchases() {
    try {
        const { data: purchases, error } = await supabase
            .from('trait_purchases')
            .select(`
                *,
                shop_traits (name, category)
            `)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const tbody = document.getElementById('purchasesTableBody');
        if (purchases.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-400">No purchases found</td></tr>';
            return;
        }

        tbody.innerHTML = purchases.map(purchase => `
            <tr>
                <td class="p-4 text-sm">${formatDate(purchase.created_at)}</td>
                <td class="p-4">
                    <span class="font-mono text-xs">${formatAddress(purchase.wallet_address)}</span>
                </td>
                <td class="p-4">${purchase.shop_traits?.name || 'Unknown'}</td>
                <td class="p-4">
                    <span class="text-xs px-2 py-1 rounded-full ${
                        purchase.payment_method === 'free' ? 'bg-emerald-500/20 text-emerald-400' :
                        purchase.payment_method === 'burn' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-green-500/20 text-green-400'
                    }">
                        ${purchase.payment_method === 'free' ? '🎁 FREE' : purchase.payment_method === 'burn' ? '🔥 Burn' : '💰 SOL'}
                    </span>
                </td>
                <td class="p-4">${
                    purchase.payment_method === 'free' ? 'FREE' :
                    purchase.payment_method === 'burn' ? `${purchase.nfts_burned_count} NFTs` :
                    `${purchase.sol_amount} SOL`
                }</td>
                <td class="p-4">${getStatusBadge(purchase.status)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading shop purchases:', error);
    }
}

window.toggleTraitStatus = async function(traitId, newStatus) {
    if (!supabase) return;

    try {
        const { error } = await supabase
            .from('shop_traits')
            .update({ is_active: newStatus })
            .eq('id', traitId);

        if (error) throw error;

        showToast('Trait Updated', `Trait ${newStatus ? 'activated' : 'deactivated'} successfully`, '✅');
        await loadShopTraits();
    } catch (error) {
        console.error('Error updating trait:', error);
        showToast('Error', 'Failed to update trait status', '❌');
    }
};

window.editTraitStock = async function(traitId, currentStock) {
    if (!supabase) return;

    const newStock = prompt(
        `Enter new stock quantity (current: ${currentStock !== null ? currentStock : 'unlimited'})\n\nEnter a number or leave empty for unlimited:`,
        currentStock !== null ? currentStock : ''
    );

    if (newStock === null) return;

    const stockValue = newStock.trim() === '' ? null : parseInt(newStock);

    if (newStock.trim() !== '' && (isNaN(stockValue) || stockValue < 0)) {
        showToast('Invalid Input', 'Please enter a valid number or leave empty for unlimited', '❌');
        return;
    }

    try {
        const { error } = await supabase
            .from('shop_traits')
            .update({ stock_quantity: stockValue })
            .eq('id', traitId);

        if (error) throw error;

        showToast('Stock Updated', `Stock ${stockValue !== null ? `set to ${stockValue}` : 'set to unlimited'}`, '✅');
        await loadShopTraits();
    } catch (error) {
        console.error('Error updating stock:', error);
        showToast('Error', 'Failed to update stock quantity', '❌');
    }
};

window.editMaxClaimsPerWallet = async function(traitId, currentMax) {
    if (!supabase) return;

    const newMax = prompt(
        `Enter max claims per wallet (current: ${currentMax})\n\nEnter a number or leave empty to remove limit:`,
        currentMax !== null ? currentMax : ''
    );

    if (newMax === null) return;

    const maxValue = newMax.trim() === '' ? null : parseInt(newMax);

    if (newMax.trim() !== '' && (isNaN(maxValue) || maxValue < 1)) {
        showToast('Invalid Input', 'Please enter a valid number (1 or more) or leave empty to remove limit', '❌');
        return;
    }

    try {
        const { error } = await supabase
            .from('shop_traits')
            .update({ max_claims_per_wallet: maxValue })
            .eq('id', traitId);

        if (error) throw error;

        showToast('Max Claims Updated', `Max claims ${maxValue !== null ? `set to ${maxValue} per wallet` : 'limit removed'}`, '✅');
        await loadShopTraits();
    } catch (error) {
        console.error('Error updating max claims:', error);
        showToast('Error', 'Failed to update max claims per wallet', '❌');
    }
};

async function loadShopTransactions() {
    if (!supabase) {
        console.error('Supabase not configured');
        return;
    }

    try {
        let query = supabase
            .from('trait_purchases')
            .select(`
                *,
                shop_traits (name, category, image_url, trait_value)
            `)
            .order('created_at', { ascending: false });

        if (shopTransactionsFilters.status) {
            query = query.eq('status', shopTransactionsFilters.status);
        }

        if (shopTransactionsFilters.paymentMethod) {
            query = query.eq('payment_method', shopTransactionsFilters.paymentMethod);
        }

        if (shopTransactionsFilters.dateRange !== 'all') {
            const now = new Date();
            let startDate;

            if (shopTransactionsFilters.dateRange === 'today') {
                startDate = new Date(now.setHours(0, 0, 0, 0));
            } else if (shopTransactionsFilters.dateRange === 'week') {
                startDate = new Date(now.setDate(now.getDate() - 7));
            } else if (shopTransactionsFilters.dateRange === 'month') {
                startDate = new Date(now.setDate(now.getDate() - 30));
            }

            query = query.gte('created_at', startDate.toISOString());
        }

        const { data, error } = await query;

        if (error) throw error;

        allShopTransactions = data || [];

        if (shopTransactionsFilters.search) {
            const searchLower = shopTransactionsFilters.search.toLowerCase();
            allShopTransactions = allShopTransactions.filter(tx =>
                tx.wallet_address?.toLowerCase().includes(searchLower) ||
                tx.target_nft_mint?.toLowerCase().includes(searchLower) ||
                tx.shop_traits?.name?.toLowerCase().includes(searchLower) ||
                tx.id?.toLowerCase().includes(searchLower)
            );
        }

        updateShopTransactionsStats();
        renderShopTransactions();
    } catch (error) {
        console.error('Error loading shop transactions:', error);
        showToast('Error Loading Data', error.message, '❌');
    }
}

function updateShopTransactionsStats() {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    const todayTx = allShopTransactions.filter(tx =>
        new Date(tx.created_at) >= todayStart
    );

    const completedTx = allShopTransactions.filter(tx => tx.status === 'completed');
    const totalBurned = allShopTransactions.reduce((sum, tx) => sum + (tx.nfts_burned_count || 0), 0);
    const totalRevenue = allShopTransactions.reduce((sum, tx) => sum + (parseFloat(tx.sol_amount) || 0), 0);

    const successRate = allShopTransactions.length > 0
        ? Math.round((completedTx.length / allShopTransactions.length) * 100)
        : 0;

    document.getElementById('shopTxStatsToday').textContent = todayTx.length;
    document.getElementById('shopTxStatsAllTime').textContent = allShopTransactions.length;
    document.getElementById('shopTxStatsBurned').textContent = totalBurned;
    document.getElementById('shopTxStatsRevenue').textContent = `${totalRevenue.toFixed(4)} SOL`;
    document.getElementById('shopTxStatsSuccess').textContent = `${successRate}%`;
}

function renderShopTransactions() {
    const tbody = document.getElementById('shopTransactionsTableBody');
    const start = (shopTransactionsPage - 1) * shopTransactionsPageSize;
    const end = start + shopTransactionsPageSize;
    const pageTransactions = allShopTransactions.slice(start, end);

    if (pageTransactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="p-8 text-center text-gray-400">
                    No shop transactions found
                </td>
            </tr>
        `;
        updateShopTransactionsPagination();
        return;
    }

    tbody.innerHTML = pageTransactions.map(tx => {
        const paymentBadge = tx.payment_method === 'free'
            ? '<span class="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">🎁 FREE</span>'
            : tx.payment_method === 'burn'
            ? '<span class="text-xs px-2 py-1 rounded-full bg-orange-500/20 text-orange-400">🔥 Burn</span>'
            : '<span class="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">💰 SOL</span>';

        const amount = tx.payment_method === 'free'
            ? 'FREE'
            : tx.payment_method === 'burn'
            ? `${tx.nfts_burned_count || 0} NFTs`
            : `${parseFloat(tx.sol_amount || 0).toFixed(4)} SOL`;

        return `
            <tr class="hover:bg-white/5 cursor-pointer" onclick="showShopTransactionDetail('${tx.id}')">
                <td class="p-4">
                    ${getStatusBadge(tx.status)}
                </td>
                <td class="p-4">
                    <div class="text-sm text-white">${formatDate(tx.created_at)}</div>
                </td>
                <td class="p-4">
                    <div class="font-mono text-sm">${formatAddress(tx.wallet_address)}</div>
                    <button class="copy-btn mt-1" onclick="event.stopPropagation(); copyToClipboard('${tx.wallet_address}', this)">
                        Copy
                    </button>
                </td>
                <td class="p-4">
                    <div class="text-sm text-white">${tx.shop_traits?.name || 'Unknown'}</div>
                    <div class="text-xs text-gray-500 mt-1">${tx.shop_traits?.category || 'N/A'}</div>
                </td>
                <td class="p-4">
                    ${paymentBadge}
                </td>
                <td class="p-4">
                    <div class="text-sm font-semibold">${amount}</div>
                </td>
                <td class="p-4">
                    <div class="font-mono text-xs text-gray-400">${formatAddress(tx.target_nft_mint)}</div>
                    <button class="copy-btn mt-1" onclick="event.stopPropagation(); copyToClipboard('${tx.target_nft_mint}', this)">
                        Copy
                    </button>
                </td>
                <td class="p-4">
                    <button class="btn-secondary px-3 py-1.5 rounded text-xs" onclick="event.stopPropagation(); showShopTransactionDetail('${tx.id}')">
                        View Details
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    updateShopTransactionsPagination();
}

function updateShopTransactionsPagination() {
    const total = allShopTransactions.length;
    const start = (shopTransactionsPage - 1) * shopTransactionsPageSize + 1;
    const end = Math.min(shopTransactionsPage * shopTransactionsPageSize, total);

    document.getElementById('shopPageInfo').textContent = `${start}-${end} of ${total}`;

    const prevBtn = document.getElementById('shopPrevPageBtn');
    const nextBtn = document.getElementById('shopNextPageBtn');

    prevBtn.disabled = shopTransactionsPage === 1;
    nextBtn.disabled = end >= total;
}

window.showShopTransactionDetail = async function(transactionId) {
    const tx = allShopTransactions.find(t => t.id === transactionId);
    if (!tx) return;

    const modal = document.getElementById('shopDetailModal');
    const content = document.getElementById('shopModalContent');

    let burnedNFTsSection = '';
    if (tx.payment_method === 'burn' && tx.burned_nfts && tx.burned_nfts.length > 0) {
        burnedNFTsSection = `
            <div>
                <h3 class="text-lg font-semibold border-b border-white/10 pb-2 mb-4">Burned NFTs (${tx.burned_nfts.length} Total)</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                    ${tx.burned_nfts.map((nft, index) => `
                        <div class="glass rounded-lg p-4 flex items-center gap-3">
                            <span class="text-2xl">🔥</span>
                            <div class="flex-1 min-w-0">
                                <div class="text-xs text-gray-400">NFT #${index + 1}</div>
                                <div class="font-medium text-sm">${nft.name || 'Trap Star'}</div>
                                <div class="font-mono text-xs text-gray-500 truncate">${nft.mint}</div>
                                <button class="copy-btn mt-1 text-xs" onclick="event.stopPropagation(); copyToClipboard('${nft.mint}', this)">
                                    Copy Mint
                                </button>
                                <a href="https://solscan.io/token/${nft.mint}" target="_blank" class="text-xs text-blue-400 hover:text-blue-300 ml-2">
                                    View on Solscan →
                                </a>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    content.innerHTML = `
        <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                    <h3 class="text-lg font-semibold border-b border-white/10 pb-2">Purchase Info</h3>
                    <div class="info-row">
                        <div class="info-label">Purchase ID</div>
                        <div class="info-value font-mono text-xs">${tx.id}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Status</div>
                        <div class="info-value">${getStatusBadge(tx.status)}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Wallet</div>
                        <div class="info-value font-mono text-xs">${tx.wallet_address}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Created</div>
                        <div class="info-value">${formatDate(tx.created_at)}</div>
                    </div>
                    ${tx.transaction_signature ? `
                    <div class="info-row">
                        <div class="info-label">Transaction</div>
                        <div class="info-value">${getSolscanLink(tx.transaction_signature)}</div>
                    </div>` : ''}
                    ${tx.error_message ? `
                    <div class="info-row">
                        <div class="info-label">Error</div>
                        <div class="info-value text-red-400 text-xs">${tx.error_message}</div>
                    </div>` : ''}
                </div>

                <div class="space-y-4">
                    <h3 class="text-lg font-semibold border-b border-white/10 pb-2">Trait Details</h3>
                    ${tx.shop_traits?.image_url ? `
                    <div class="flex justify-center mb-4">
                        <img src="${tx.shop_traits.image_url}" alt="${tx.shop_traits.name}" class="w-32 h-32 object-cover rounded-lg">
                    </div>` : ''}
                    <div class="info-row">
                        <div class="info-label">Trait Name</div>
                        <div class="info-value font-semibold">${tx.shop_traits?.name || 'Unknown'}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Category</div>
                        <div class="info-value">${tx.shop_traits?.category || 'N/A'}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Trait Value</div>
                        <div class="info-value">${tx.shop_traits?.trait_value || tx.shop_traits?.name || 'N/A'}</div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Target NFT</div>
                        <div class="info-value font-mono text-xs">${tx.target_nft_mint}</div>
                    </div>
                </div>
            </div>

            <div>
                <h3 class="text-lg font-semibold border-b border-white/10 pb-2 mb-4">Payment Details</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="glass rounded-lg p-4">
                        <p class="text-xs text-gray-400 mb-1">Payment Method</p>
                        <p class="text-lg font-bold">
                            ${tx.payment_method === 'free'
                                ? '<span class="text-emerald-400">🎁 FREE</span>'
                                : tx.payment_method === 'burn'
                                ? '<span class="text-orange-400">🔥 Burn</span>'
                                : '<span class="text-green-400">💰 SOL</span>'}
                        </p>
                    </div>
                    <div class="glass rounded-lg p-4">
                        <p class="text-xs text-gray-400 mb-1">Amount</p>
                        <p class="text-lg font-bold">
                            ${tx.payment_method === 'free'
                                ? 'FREE'
                                : tx.payment_method === 'burn'
                                ? `${tx.nfts_burned_count || 0} NFTs`
                                : `${parseFloat(tx.sol_amount || 0).toFixed(4)} SOL`}
                        </p>
                    </div>
                    <div class="glass rounded-lg p-4">
                        <p class="text-xs text-gray-400 mb-1">Status</p>
                        ${getStatusBadge(tx.status)}
                    </div>
                    <div class="glass rounded-lg p-4">
                        <p class="text-xs text-gray-400 mb-1">Date</p>
                        <p class="text-sm font-medium">${formatDate(tx.created_at)}</p>
                    </div>
                </div>
            </div>

            ${burnedNFTsSection}

            <div class="flex gap-3">
                <button class="btn-secondary px-4 py-2 rounded-lg flex-1" onclick="exportShopTransactionCSV('${tx.id}')">
                    Export as CSV
                </button>
                <button class="btn-secondary px-4 py-2 rounded-lg flex-1" onclick="copyShopTransactionDetails('${tx.id}')">
                    Copy Details
                </button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
};

window.copyShopTransactionDetails = function(transactionId) {
    const tx = allShopTransactions.find(t => t.id === transactionId);
    if (!tx) return;

    let details = `Purchase ID: ${tx.id}
Status: ${tx.status}
Wallet: ${tx.wallet_address}
Created: ${formatDate(tx.created_at)}
Trait: ${tx.shop_traits?.name || 'Unknown'} (${tx.shop_traits?.category || 'N/A'})
Target NFT: ${tx.target_nft_mint}
Payment Method: ${tx.payment_method}
Amount: ${tx.payment_method === 'free' ? 'FREE' : tx.payment_method === 'burn' ? `${tx.nfts_burned_count} NFTs` : `${tx.sol_amount} SOL`}`;

    if (tx.payment_method === 'burn' && tx.burned_nfts && tx.burned_nfts.length > 0) {
        details += `\n\nBurned NFTs (${tx.burned_nfts.length} total):\n`;
        tx.burned_nfts.forEach((nft, index) => {
            details += `${index + 1}. ${nft.name || 'Trap Star'} - ${nft.mint}\n`;
        });
    }

    navigator.clipboard.writeText(details).then(() => {
        showToast('Copied!', 'Transaction details copied to clipboard', '📋');
    });
};

window.exportShopTransactionCSV = function(transactionId) {
    const tx = allShopTransactions.find(t => t.id === transactionId);
    if (!tx) return;

    let csv = `Purchase ID,Status,Wallet,Created,Trait,Category,Target NFT,Payment Method,Amount\n`;
    csv += `${tx.id},${tx.status},${tx.wallet_address},${tx.created_at},${tx.shop_traits?.name || 'Unknown'},${tx.shop_traits?.category || 'N/A'},${tx.target_nft_mint},${tx.payment_method},${tx.payment_method === 'free' ? 'FREE' : tx.payment_method === 'burn' ? tx.nfts_burned_count : tx.sol_amount}\n`;

    if (tx.payment_method === 'burn' && tx.burned_nfts && tx.burned_nfts.length > 0) {
        csv += `\nBurned NFTs\n`;
        csv += `Index,Name,Mint Address\n`;
        tx.burned_nfts.forEach((nft, index) => {
            csv += `${index + 1},${nft.name || 'Trap Star'},${nft.mint}\n`;
        });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shop-transaction-${tx.id.substring(0, 8)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showToast('Exported!', 'Transaction exported as CSV', '📥');
};

function setupShopTransactionsRealtimeSubscription() {
    if (!supabase) return;

    shopRealtimeChannel = supabase
        .channel('trait_purchases_changes')
        .on('postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'trait_purchases'
            },
            (payload) => {
                console.log('Shop transaction real-time update:', payload);

                if (payload.eventType === 'INSERT') {
                    showToast('New Shop Purchase', 'A new trait purchase has been made', '🛍️');
                } else if (payload.eventType === 'UPDATE') {
                    if (payload.new.status === 'failed') {
                        showToast('Purchase Failed', `Purchase ${payload.new.id.substring(0, 8)} failed`, '⚠️');
                    } else if (payload.new.status === 'completed') {
                        showToast('Purchase Completed', `Purchase ${payload.new.id.substring(0, 8)} completed`, '✅');
                    }
                }

                const currentTab = document.getElementById('shopTransactionsSection').classList.contains('hidden') ? null : 'shopTransactions';
                if (currentTab === 'shopTransactions') {
                    loadShopTransactions();
                }
            }
        )
        .subscribe();
}

function setupShopTransactionsEventListeners() {
    document.getElementById('closeShopModalBtn')?.addEventListener('click', () => {
        document.getElementById('shopDetailModal').classList.add('hidden');
    });

    document.getElementById('shopFilterPayment')?.addEventListener('change', (e) => {
        shopTransactionsFilters.paymentMethod = e.target.value;
        shopTransactionsPage = 1;
        loadShopTransactions();
    });

    document.getElementById('shopFilterStatus')?.addEventListener('change', (e) => {
        shopTransactionsFilters.status = e.target.value;
        shopTransactionsPage = 1;
        loadShopTransactions();
    });

    document.getElementById('shopFilterDateRange')?.addEventListener('change', (e) => {
        shopTransactionsFilters.dateRange = e.target.value;
        shopTransactionsPage = 1;
        loadShopTransactions();
    });

    document.getElementById('shopSearchInput')?.addEventListener('input', (e) => {
        shopTransactionsFilters.search = e.target.value;
        shopTransactionsPage = 1;
        setTimeout(() => loadShopTransactions(), 300);
    });

    document.getElementById('shopPrevPageBtn')?.addEventListener('click', () => {
        if (shopTransactionsPage > 1) {
            shopTransactionsPage--;
            renderShopTransactions();
        }
    });

    document.getElementById('shopNextPageBtn')?.addEventListener('click', () => {
        const maxPage = Math.ceil(allShopTransactions.length / shopTransactionsPageSize);
        if (shopTransactionsPage < maxPage) {
            shopTransactionsPage++;
            renderShopTransactions();
        }
    });
}

document.getElementById('adminConnectBtn').addEventListener('click', connectWallet);

document.getElementById('tryAgainBtn').addEventListener('click', () => {
    document.getElementById('accessDeniedScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
});

document.getElementById('tabTransactions')?.addEventListener('click', () => switchTab('transactions'));
document.getElementById('tabShopTransactions')?.addEventListener('click', () => switchTab('shopTransactions'));
document.getElementById('tabShop')?.addEventListener('click', () => switchTab('shop'));

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase configuration missing');
    showToast('Configuration Error', 'Supabase is not configured', '⚠️');
}
