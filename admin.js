import './shader-background.js';

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
        if (!window.solana || !window.solana.isPhantom) {
            alert('Please install Phantom wallet');
            return;
        }

        const response = await window.solana.connect();
        wallet = response.publicKey.toString();

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
        setupEventListeners();
    } catch (error) {
        console.error('Wallet connection error:', error);
        showToast('Failed to connect wallet', error.message, '❌');
    }
}

function disconnectWallet() {
    if (window.solana) {
        window.solana.disconnect();
    }
    wallet = null;

    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
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
                            <a href="${tx.new_image_url}" target="_blank" class="signature-link">View on IPFS →</a>
                        </div>
                    </div>` : ''}
                    ${tx.new_metadata_url ? `
                    <div class="info-row">
                        <div class="info-label">New Metadata</div>
                        <div class="info-value">
                            <a href="${tx.new_metadata_url}" target="_blank" class="signature-link">View on IPFS →</a>
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

document.getElementById('adminConnectBtn').addEventListener('click', connectWallet);

document.getElementById('tryAgainBtn').addEventListener('click', () => {
    document.getElementById('accessDeniedScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
});

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase configuration missing');
    showToast('Configuration Error', 'Supabase is not configured', '⚠️');
}
