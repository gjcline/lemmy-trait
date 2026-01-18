let currentWalletProvider = null;
let currentWalletType = null;

export const WALLET_TYPES = {
    PHANTOM: 'phantom',
    SOLFLARE: 'solflare'
};

export function detectWallets() {
    const wallets = [];

    if (window.solana && window.solana.isPhantom) {
        wallets.push({
            type: WALLET_TYPES.PHANTOM,
            name: 'Phantom',
            provider: window.solana,
            icon: '👻'
        });
    }

    if (window.solflare && window.solflare.isSolflare) {
        wallets.push({
            type: WALLET_TYPES.SOLFLARE,
            name: 'SolFlare',
            provider: window.solflare,
            icon: '🔥'
        });
    }

    return wallets;
}

export function setWalletProvider(walletType, provider) {
    currentWalletType = walletType;
    currentWalletProvider = provider;
    window.walletAdapter = provider;
}

export function getWalletProvider() {
    return currentWalletProvider;
}

export function getWalletType() {
    return currentWalletType;
}

export function clearWalletProvider() {
    currentWalletProvider = null;
    currentWalletType = null;
    window.walletAdapter = null;
}

export function getWalletAdapter() {
    if (!currentWalletProvider) {
        return null;
    }

    return {
        publicKey: currentWalletProvider.publicKey,
        signTransaction: async (tx) => await currentWalletProvider.signTransaction(tx),
        signAllTransactions: async (txs) => await currentWalletProvider.signAllTransactions(txs)
    };
}
