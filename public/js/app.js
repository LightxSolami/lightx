// Initialize Buffer if not available
if (typeof window !== 'undefined' && !window.Buffer) {
    console.log('Buffer not found, initializing from buffer module');
    try {
        window.Buffer = window.buffer?.Buffer || Buffer;
    } catch (e) {
        console.error('Could not initialize Buffer:', e);
    }
}

// Helper function to clean up any lingering notifications
function cleanupNotifications() {
    // Remove any approval notifications that might be lingering
    const notifications = document.querySelectorAll('.quick-approval-notice');
    notifications.forEach(notification => {
        if (notification && notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    });
    
    // Clean up any toast notifications
    const toasts = document.querySelectorAll('.success-toast, .error-toast');
    toasts.forEach(toast => {
        if (toast && toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    });
}

// Initialize Socket.IO
const socket = io({
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000
});

// DOM Elements
const connectWalletBtn = document.getElementById('connectWallet');
const walletAddressSpan = document.getElementById('walletAddress');
const startMonitoringBtn = document.getElementById('startMonitoring');
const stopMonitoringBtn = document.getElementById('stopMonitoring');
const tokenList = document.getElementById('tokenList');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');

// Wallet connection state
let isWalletConnected = false;
let isMonitoring = false;
let socketId = null;

// Global variables
let currentPage = 1;
let tokensPerPage = 10;
let totalTokens = 0;
let monitoringTimeout = null;

// Check for stored monitoring state on page load
document.addEventListener('DOMContentLoaded', () => {
    // Clean up any lingering notifications
    cleanupNotifications();
    
    try {
        const storedMonitoring = localStorage.getItem('monitoringActive');
        if (storedMonitoring === 'true') {
            console.log('Restoring monitoring state from previous session');
            isMonitoring = true;
            // We'll start monitoring when socket connects
        }
    } catch (e) {
        console.error('Error checking stored monitoring state:', e);
    }
});

// Store monitoring state for persistence
function storeMonitoringState(active) {
    try {
        localStorage.setItem('monitoringActive', active.toString());
    } catch (e) {
        console.error('Error storing monitoring state:', e);
    }
}

// Check if Phantom is installed
const getProvider = () => {
    if ('phantom' in window) {
        const provider = window.phantom?.solana;
        if (provider?.isPhantom) {
            return provider;
        }
    }
    window.open('https://phantom.app/', '_blank');
    return null;
};

// Update connection status
function updateConnectionStatus(connected) {
    isWalletConnected = connected;
    if (connected) {
        statusDot.style.backgroundColor = 'var(--success-color)';
        statusDot.style.boxShadow = '0 0 10px var(--success-color)';
        statusText.textContent = isMonitoring ? 'Monitoring Active' : 'Connected';
        statusText.parentElement.classList.add('online');
    } else {
        statusDot.style.backgroundColor = 'var(--error-color)';
        statusDot.style.boxShadow = 'none';
        statusText.textContent = 'Disconnected';
        statusText.parentElement.classList.remove('online');
        
        // If monitoring was active but socket disconnected, update button states
        if (isMonitoring) {
            startMonitoringBtn.disabled = true;
            stopMonitoringBtn.disabled = false;
        }
    }
}

// Update monitoring status
function updateMonitoringStatus(active) {
    isMonitoring = active;
    storeMonitoringState(active);
    
    if (active) {
        startMonitoringBtn.disabled = true;
        stopMonitoringBtn.disabled = false;
        statusText.textContent = 'Monitoring Active';
        statusDot.style.backgroundColor = 'var(--success-color)';
        statusDot.style.boxShadow = '0 0 10px var(--success-color)';
    } else {
        startMonitoringBtn.disabled = false;
        stopMonitoringBtn.disabled = true;
        statusText.textContent = isWalletConnected ? 'Connected' : 'Disconnected';
        statusDot.style.backgroundColor = isWalletConnected ? 'var(--success-color)' : 'var(--error-color)';
        statusDot.style.boxShadow = isWalletConnected ? '0 0 10px var(--success-color)' : 'none';
    }
}

// Function to restore monitoring state if needed
function restoreMonitoringIfNeeded() {
    if (isMonitoring && socket.connected) {
        console.log('Restoring monitoring state after reconnection');
        socket.emit('startMonitoring', { clientId: socketId });
    }
}

// Socket connection handling
socket.on('connect', () => {
    console.log('Socket connected with ID:', socket.id);
    socketId = socket.id;
    updateConnectionStatus(true);
    
    // If monitoring was active before, restart it
    restoreMonitoringIfNeeded();
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
    updateConnectionStatus(false);
    
    // Show notification about disconnection
    if (isMonitoring) {
        if (window.showWalletNotification) {
            window.showWalletNotification(
                'warning',
                'Connection Lost',
                'Server connection was lost. Attempting to reconnect...',
                8000
            );
        }
    }
});

socket.on('reconnect', (attemptNumber) => {
    console.log(`Socket reconnected after ${attemptNumber} attempts`);
    updateConnectionStatus(true);
    
    // Restore monitoring if it was active
    restoreMonitoringIfNeeded();
    
    if (window.showWalletNotification) {
        window.showWalletNotification(
            'success',
            'Connection Restored',
            'Server connection has been restored.',
            5000
        );
    }
});

socket.on('reconnect_failed', () => {
    console.log('Socket reconnection failed after all attempts');
    if (window.showWalletNotification) {
        window.showWalletNotification(
            'error',
            'Connection Failed',
            'Could not reconnect to server. Please refresh the page.',
            0 // Don't auto-close
        );
    }
});

// Connect to Phantom wallet
connectWalletBtn.addEventListener('click', async () => {
    try {
        console.log('Connect wallet button clicked');
        // Check if PhantomWallet class is available and loaded
        if (!window.phantomWallet) {
            console.error('Phantom wallet integration not loaded');
            if (window.showWalletNotification) {
                window.showWalletNotification('error', 'Wallet Error', 'Wallet integration not loaded. Please refresh the page.');
            } else {
                alert('Wallet integration not loaded. Please refresh the page.');
            }
                return;
            }
            
        const wallet = window.phantomWallet;
        
        // Check if Phantom is installed at all
        if (!wallet.isPhantomInstalled()) {
            console.error('Phantom wallet not installed');
            
            if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
                // Mobile device handling
                if (confirm('Phantom wallet not found. Open this site in the Phantom app?')) {
                    const link = `https://phantom.app/ul/browse/${window.location.href}`;
                    window.location.href = link;
        }
    } else {
                // Desktop handling
                if (confirm('Phantom wallet extension not detected. Install it now?')) {
                    window.open('https://phantom.app/', '_blank');
                }
            }
            return;
        }
        
        // Check if wallet is connected or not
        if (!wallet.isConnected()) {
            console.log('Attempting to connect to wallet...');
            
            // Update UI to show connecting state
            connectWalletBtn.textContent = 'Connecting...';
            connectWalletBtn.classList.add('connecting');
            statusDot.style.background = '#ff9900'; // Orange for connecting
            statusText.textContent = 'Connecting...';
            
            // Try to connect with enhanced error handling
            try {
                const success = await wallet.connect();
                
                // Always remove connecting class regardless of outcome
                connectWalletBtn.classList.remove('connecting');
                
                if (!success) {
                    console.error('Wallet connection failed');
                    // Error notification already handled in wallet.connect()
                    return;
                }
                
                console.log('Wallet connected successfully');
            } catch (err) {
                // Handle specific error and clean up UI
                console.error('Error during wallet connection:', err);
                connectWalletBtn.classList.remove('connecting');
                statusDot.style.background = 'var(--error-color)';
                statusText.textContent = 'Connection Failed';
                
                if (window.showWalletNotification) {
                    window.showWalletNotification('error', 'Connection Error', err.message || 'Unknown error occurred');
                }
                return;
            }
        } else {
            console.log('Attempting to disconnect wallet...');
            
            // Update UI to show disconnecting state
            connectWalletBtn.textContent = 'Disconnecting...';
            statusDot.style.background = '#ff9900'; // Orange for transition
            statusText.textContent = 'Disconnecting...';
            
            // If monitoring was active, stop it before disconnecting wallet
            if (isMonitoring) {
                socket.emit('stopMonitoring');
                updateMonitoringStatus(false);
            }
            
            // Disconnect the wallet
            try {
                const success = await wallet.disconnect();
                if (!success) {
                    console.error('Wallet disconnection failed');
                    
                    // Reset button state
                    if (wallet.isConnected()) {
                        connectWalletBtn.textContent = 'Disconnect';
                        statusDot.style.background = 'var(--success-color)';
                        statusText.textContent = 'Connected';
                    } else {
                        connectWalletBtn.textContent = 'Connect Phantom';
                        statusDot.style.background = 'var(--error-color)';
                        statusText.textContent = 'Disconnected';
                    }
                    
                    if (window.showWalletNotification) {
                        window.showWalletNotification('error', 'Disconnection Error', 'Failed to disconnect wallet. Please try again.');
                    }
                    return;
                }
                
                console.log('Wallet disconnected successfully');
            } catch (err) {
                console.error('Error during wallet disconnection:', err);
                if (window.showWalletNotification) {
                    window.showWalletNotification('error', 'Disconnection Error', err.message || 'Unknown error occurred');
                }
            }
            }
        } catch (error) {
        console.error('Wallet connection handling error:', error);
        connectWalletBtn.classList.remove('connecting');
        
        if (window.showWalletNotification) {
            window.showWalletNotification('error', 'Connection Error', error.message || 'Unknown error occurred');
        } else {
            alert(`Wallet error: ${error.message || 'Unknown error occurred'}`);
        }
    }
});

// Function to start token monitoring
function startMonitoring() {
    console.log('Starting token monitoring...');
    
    // Check if wallet is connected
    const isWalletConnected = window.phantomWallet && window.phantomWallet.isConnected();
    
    // We can start monitoring without a wallet, but show a warning
    if (!isWalletConnected) {
        console.log('Starting monitoring without wallet connection');
        console.warn('No wallet connected. Monitoring will start but some features may be limited.');
    }

    // Get selected token sources
    const selectedSources = {
        rayFee: document.getElementById('sourceRayFee')?.checked || true,
        pumpFun: document.getElementById('sourcePumpFun')?.checked || true,
        moonshot: document.getElementById('sourceMoonshot')?.checked || true,
        raydium: document.getElementById('sourceRaydium')?.checked || true,
        jupiter: document.getElementById('sourceJupiter')?.checked || true
    };
    
    console.log('Selected token sources:', selectedSources);
    
    // Only proceed if at least one source is selected
    if (!Object.values(selectedSources).some(value => value === true)) {
        console.error('No token sources selected');
        if (window.showWalletNotification) {
            window.showWalletNotification('warning', 'No Sources Selected', 'Please select at least one token source to monitor.');
        } else {
            alert('Please select at least one token source to monitor.');
        }
        return;
    }

    // Update UI
    document.getElementById('startMonitoring').disabled = true;
    document.getElementById('stopMonitoring').disabled = false;
    
    // Show loading indicator
    const tokenList = document.getElementById('tokenList');
    const loadingElement = document.querySelector('.loading');
    if (loadingElement && tokenList && tokenList.children.length === 0) {
        loadingElement.style.display = 'block';
    }
    
    // Check if the socket is connected
    if (!socket.connected) {
        console.log('Socket not connected, attempting to reconnect...');
        socket.connect();
    }
    
    // Send the start monitoring event with selected sources
    socket.emit('startMonitoring', { 
        address: isWalletConnected ? window.phantomWallet.getPublicKey().toString() : null,
        sources: selectedSources
    });
    
    // Update status
    const statusElement = document.querySelector('.status-text');
    if (statusElement) {
        statusElement.innerText = 'Starting monitoring...';
        statusElement.classList.add('connecting');
    }
    
    // Set a timeout to reset if we don't get a response from the server
    monitoringTimeout = setTimeout(() => {
        console.log('No response from server, resetting monitoring state');
        resetMonitoringUI();
    }, 10000);
    
    // Save monitoring state
    localStorage.setItem('monitoringActive', 'true');
    // Save selected sources
    localStorage.setItem('selectedSources', JSON.stringify(selectedSources));
}

// Stop monitoring with confirmation
stopMonitoringBtn.addEventListener('click', () => {
    stopMonitoringBtn.disabled = true;
    stopMonitoringBtn.textContent = 'Stopping...';
    
    // Emit stop monitoring event with current socket ID for tracking
    socket.emit('stopMonitoring', { clientId: socketId });
    
    // Set a timeout in case the server doesn't respond
    const stopTimeout = setTimeout(() => {
        // Even if server doesn't respond, update UI as if stopped
        stopMonitoringBtn.textContent = 'Stop Monitoring';
    updateMonitoringStatus(false);
        console.log('Monitoring stopped locally, but server did not confirm');
    }, 3000);
    
    // Wait for server confirmation
    socket.once('monitoringStopped', (data) => {
        clearTimeout(stopTimeout);
        stopMonitoringBtn.textContent = 'Stop Monitoring';
        
        if (data.success) {
            console.log('Monitoring stopped successfully');
            updateMonitoringStatus(false);
        } else {
            stopMonitoringBtn.disabled = false;
            console.error('Failed to stop monitoring:', data.error || 'Unknown error');
        }
    });
});

// Before the page unloads, try to stop monitoring
window.addEventListener('beforeunload', (event) => {
    if (isMonitoring && socket.connected) {
        // Send a synchronous request to stop monitoring
        socket.emit('stopMonitoring', { clientId: socketId, sync: true });
    }
});

// Function to handle new token notifications
function handleNewToken(tokenInfo) {
    // Debug log the incoming token info
    console.log('Handling new token notification:', tokenInfo);
    
    // Validate token info
    if (!tokenInfo || !tokenInfo.tokenAddress) {
        console.error('Invalid token info received:', tokenInfo);
        return;
    }

    // Remove loading element if exists
    const loadingElement = document.querySelector('.loading');
    if (loadingElement) {
        loadingElement.classList.remove('initial-load');
        loadingElement.remove(); // Completely remove the loading element to ensure tokens are visible
    }
    
    // Check if this token already exists in the list to avoid duplicates
    const existingCard = document.querySelector(`[data-token-address="${tokenInfo.tokenAddress}"]`);
    if (existingCard) {
        console.log(`Token ${tokenInfo.tokenAddress} already exists in the list, skipping`);
        return;
    }
    
    // Create and add the token card immediately
    const tokenCard = createTokenCard(tokenInfo);
    tokenCard.classList.add('new-token');
    
    // Add source badge if available
    if (tokenInfo.source) {
        const sourceBadge = document.createElement('div');
        sourceBadge.className = 'source-badge';
        sourceBadge.textContent = tokenInfo.source;
        sourceBadge.classList.add(`source-${tokenInfo.source.toLowerCase().replace(' ', '-')}`);
        tokenCard.appendChild(sourceBadge);
    }
    
    // Insert at the very top of the list
    const tokenList = document.getElementById('tokenList');
    
    // Make sure tokenList exists before trying to insert
    if (!tokenList) {
        console.error('Token list element not found');
        return;
    }
    
    // If the list is empty or only contains the loading element, clear it first
    if (tokenList.children.length === 0 || (tokenList.children.length === 1 && tokenList.children[0].classList.contains('loading'))) {
        tokenList.innerHTML = '';
    }
    
    tokenList.insertBefore(tokenCard, tokenList.firstChild);
    
    // Add a notification badge
    const badge = document.createElement('div');
    badge.className = 'new-token-badge';
    badge.textContent = 'NEW';
    tokenCard.appendChild(badge);
    
    // Log the new token detection
    console.log(`New token detected: ${tokenInfo.tokenName} (${tokenInfo.tokenSymbol}) from source: ${tokenInfo.source || 'unknown'}`);
    
    // Remove the animation class and badge after animation completes
    setTimeout(() => {
        tokenCard.classList.remove('new-token');
        tokenCard.style.border = 'none';
        if (badge.parentNode) {
        badge.remove();
        }
    }, 3000);
}

// Function to display tokens in the UI
function displayTokens(tokens) {
    console.log('Displaying tokens:', tokens ? tokens.length : 0);
    
    if (!tokens || tokens.length === 0) {
        tokenList.innerHTML = '<div class="loading">No tokens found. Start monitoring to detect new tokens.</div>';
        return;
    }
    
    // Sort tokens by timestamp in descending order (newest first)
    const sortedTokens = [...tokens].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    // Clear any existing content
    tokenList.innerHTML = '';
    
    // Pagination settings
    const totalPages = Math.ceil(sortedTokens.length / tokensPerPage);
    
    // Function to display tokens for current page
    function displayCurrentPage(page) {
        const startIndex = (page - 1) * tokensPerPage;
        const endIndex = startIndex + tokensPerPage;
        const pageTokens = sortedTokens.slice(startIndex, endIndex);
        
        tokenList.innerHTML = '';
        
        // Log the tokens being displayed on this page
        console.log(`Displaying page ${page} with ${pageTokens.length} tokens`);
        
        if (pageTokens.length === 0) {
            tokenList.innerHTML = '<div class="loading">No tokens found. Start monitoring to detect new tokens.</div>';
            return;
        }
        
        pageTokens.forEach(token => {
            try {
            const card = createTokenCard(token);
            tokenList.appendChild(card);
            } catch (err) {
                console.error(`Error creating card for token:`, token, err);
            }
        });
        
        // Add pagination controls
        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination';
        
        // Previous button
        const prevButton = document.createElement('button');
        prevButton.className = 'pagination-btn';
        prevButton.textContent = '←';
        prevButton.disabled = page === 1;
        prevButton.onclick = () => displayCurrentPage(page - 1);
        paginationContainer.appendChild(prevButton);
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            const pageButton = document.createElement('button');
            pageButton.className = `pagination-btn ${i === page ? 'active' : ''}`;
            pageButton.textContent = i;
            pageButton.onclick = () => displayCurrentPage(i);
            paginationContainer.appendChild(pageButton);
        }
        
        // Next button
        const nextButton = document.createElement('button');
        nextButton.className = 'pagination-btn';
        nextButton.textContent = '→';
        nextButton.disabled = page === totalPages;
        nextButton.onclick = () => displayCurrentPage(page + 1);
        paginationContainer.appendChild(nextButton);
        
        tokenList.appendChild(paginationContainer);
    }
    
    // Display first page initially
    displayCurrentPage(1);
}

// Set up wallet event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Listen for wallet connection events
    window.addEventListener('walletConnected', (event) => {
        const publicKey = event.detail.publicKey;
        console.log(`Wallet connected: ${publicKey.toString().slice(0, 4)}...${publicKey.toString().slice(-4)}`);
        updateConnectionStatus(true);
    });
    
    window.addEventListener('walletDisconnected', () => {
        console.log('Wallet disconnected');
        updateConnectionStatus(false);
    });
    
    window.addEventListener('walletAccountChanged', (event) => {
        const publicKey = event.detail.publicKey;
        console.log(`Account changed: ${publicKey.toString().slice(0, 4)}...${publicKey.toString().slice(-4)}`);
        updateConnectionStatus(true);
    });
});

// Override the executeTrade error handling to use console errors
async function handleTradeError(error, statusElement) {
    console.error('Trade execution failed:', error);
    
    // Show error in UI element if available
    if (statusElement) {
        statusElement.textContent = `Error: ${error.message}`;
        statusElement.classList.remove('loading');
        statusElement.classList.add('error');
        
        // Reset after 5 seconds
        setTimeout(() => {
            statusElement.textContent = '';
            statusElement.classList.remove('error');
        }, 5000);
    }
    
    // Show alert instead of notification
    alert(`Trade Failed: ${error.message || 'Unknown error occurred'}`);
}

// Function for direct trade execution (one-click buy) - skips preview panel
async function executeDirectTrade(tokenAddress, action = 'buy', amount = 0.1) {
    try {
        const wallet = window.phantomWallet;
        
        // Check if wallet integration is loaded
        if (!wallet) {
            throw new Error('Phantom wallet integration not available');
        }
        
        // Check if wallet is installed
        if (!wallet.isPhantomInstalled()) {
            if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
                window.location.href = `https://phantom.app/ul/browse/${window.location.href}`;
                return null;
            } else {
                window.open('https://phantom.app/', '_blank');
                return null;
            }
        }
        
        // Connect wallet if not connected
        if (!wallet.isConnected()) {
            const statusElement = document.querySelector(`#trade-status-${tokenAddress}`);
            if (statusElement) {
                statusElement.textContent = 'Connecting wallet...';
            }
            
            const connectResult = await wallet.connect();
            if (!connectResult) {
                throw new Error('Failed to connect wallet');
            }
        }

        // Show minimal status update - just a spinning indicator
        const statusElement = document.querySelector(`#trade-status-${tokenAddress}`);
        if (statusElement) {
            statusElement.textContent = '';
            statusElement.classList.add('loading');
            // Add special class for ultra-minimal UI
            statusElement.classList.add('quick-approval');
        }

        // Convert amount to lamports
        const lamports = Math.floor(amount * 1e9);

        // Determine input and output mints
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const inputMint = action === 'buy' ? SOL_MINT : tokenAddress;
        const outputMint = action === 'buy' ? tokenAddress : SOL_MINT;
        const tradeAmount = action === 'buy' ? lamports : amount;

        // Get token info to display in the wallet popup for better context
        const tokenCard = document.querySelector(`[data-token-address="${tokenAddress}"]`);
        const tokenName = tokenCard ? tokenCard.querySelector('.token-title h3').textContent : 'Unknown Token';
        const tokenSymbol = tokenCard ? tokenCard.querySelector('.token-symbol').textContent : 'UNKNOWN';

        // Silent preparation - minimal logging
        const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${tradeAmount}&slippageBps=100`;
        const quoteResponse = await fetch(quoteUrl);
        
        if (!quoteResponse.ok) {
            throw new Error(`Quote error: ${quoteResponse.status}`);
        }
        
        const quoteData = await quoteResponse.json();
        if (!quoteData || quoteData.error) {
            throw new Error(`Failed to get quote: ${quoteData?.error || 'Unknown error'}`);
        }

        // Build swap transaction silently
        const swapUrl = 'https://quote-api.jup.ag/v6/swap';
        const swapResponse = await fetch(swapUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quoteResponse: quoteData,
                userPublicKey: wallet.getPublicKey().toString(),
                wrapAndUnwrapSol: true
            })
        });

        if (!swapResponse.ok) {
            throw new Error(`Swap API error: ${swapResponse.status}`);
        }

        const swapData = await swapResponse.json();
        if (!swapData || !swapData.swapTransaction) {
            throw new Error('Failed to create swap transaction');
        }

        // Ultra-streamlined transaction processing
        const base64Data = swapData.swapTransaction;
        const binaryString = window.atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Try to deserialize transaction
        let transaction;
        try {
            transaction = solanaWeb3.VersionedTransaction.deserialize(bytes);
        } catch (err) {
            try {
                transaction = solanaWeb3.Transaction.from(bytes);
            } catch (fallbackError) {
                throw new Error('Failed to deserialize transaction');
            }
        }

        // This will trigger the Phantom wallet popup
        // There's no way to avoid this as it's a security feature of the wallet
        const signedTransaction = await wallet.signAndSendTransaction(transaction);
        
        // Remove approval notification if it exists
        const notification = document.querySelector('.quick-approval-notice');
        if (notification && document.body.contains(notification)) {
            document.body.removeChild(notification);
        }
        
        // Ultra-minimal success feedback
        if (statusElement) {
            statusElement.classList.remove('loading', 'quick-approval');
        }
        
        // Show success toast with transaction link
        const successToast = document.createElement('div');
        successToast.className = 'success-toast';
        successToast.innerHTML = `
            <div class="success-toast-content">
                <div class="success-icon">✓</div>
                <div class="success-message">
                    <strong>Purchase Complete</strong>
                    <span>Successfully bought ${tokenSymbol}</span>
                </div>
                <a href="https://solscan.io/tx/${signedTransaction.signature}" target="_blank" class="view-tx">
                    <i class="fas fa-external-link-alt"></i>
                </a>
            </div>
        `;
        document.body.appendChild(successToast);
        
        // Automatically remove the toast after 4 seconds
        setTimeout(() => {
            if (document.body.contains(successToast)) {
                successToast.classList.add('fading');
                setTimeout(() => {
                    if (document.body.contains(successToast)) {
                        document.body.removeChild(successToast);
                    }
                }, 300);
            }
        }, 4000);
        
        return signedTransaction.signature;
        
    } catch (error) {
        console.error('Direct trade failed:', error);
        
        // Remove notification if exists
        const notification = document.querySelector('.quick-approval-notice');
        if (notification && document.body.contains(notification)) {
            document.body.removeChild(notification);
        }
        
        // Minimal error handling
        const statusElement = document.querySelector(`#trade-status-${tokenAddress}`);
        if (statusElement) {
            statusElement.classList.remove('loading', 'quick-approval');
        }
        
        // Show error toast
        const errorToast = document.createElement('div');
        errorToast.className = 'error-toast';
        errorToast.innerHTML = `
            <div class="error-toast-content">
                <div class="error-icon">×</div>
                <div class="error-message">
                    <strong>Transaction Failed</strong>
                    <span>${error.message?.substring(0, 60) || 'Unknown error'}</span>
                </div>
            </div>
        `;
        document.body.appendChild(errorToast);
        
        // Automatically remove the error toast after 4 seconds
        setTimeout(() => {
            if (document.body.contains(errorToast)) {
                errorToast.classList.add('fading');
                setTimeout(() => {
                    if (document.body.contains(errorToast)) {
                        document.body.removeChild(errorToast);
                    }
                }, 300);
            }
        }, 4000);
        
        return null;
    }
}

// Function to execute trade - streamlined process
async function executeTrade(tokenAddress, action = 'buy', amount = 0.01) {
    try {
        const wallet = window.phantomWallet;
        
        // Check if wallet integration is loaded
        if (!wallet) {
            console.error('Wallet integration not loaded');
            alert('Phantom wallet integration not available. Please refresh the page and try again.');
            return null;
        }
        
        // Check if wallet is installed
        if (!wallet.isPhantomInstalled()) {
            console.error('Phantom wallet not installed');
            if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
                // For mobile, offer to open in Phantom
                if (confirm('Phantom wallet not found. Would you like to open this site in the Phantom app?')) {
                    const link = `https://phantom.app/ul/browse/${window.location.href}`;
                    window.location.href = link;
                }
            } else {
                // For desktop, offer to install
                if (confirm('Phantom wallet extension not detected. Would you like to install it now?')) {
                    window.open('https://phantom.app/', '_blank');
                }
            }
            return null;
        }
        
        // Attempt to connect wallet if not connected
        if (!wallet.isConnected()) {
            console.log('Wallet not connected, attempting to connect...');
            const statusElement = document.getElementById('trade-status');
            if (statusElement) {
                statusElement.textContent = 'Connecting wallet...';
                statusElement.classList.add('loading');
            }
            
            const connectResult = await wallet.connect();
            if (!connectResult) {
                throw new Error('Failed to connect wallet. Please try again or check your Phantom extension.');
            }
        }

        // Get token info for display
        const tokenCard = document.querySelector(`[data-token-address="${tokenAddress}"]`);
        const tokenName = tokenCard ? tokenCard.querySelector('.token-title h3').textContent : 'Unknown Token';
        const tokenSymbol = tokenCard ? tokenCard.querySelector('.token-symbol').textContent : 'UNKNOWN';

        // Show loading state and preview
        const statusElement = document.getElementById('trade-status');
        if (statusElement) {
            statusElement.textContent = `Preparing ${action}...`;
            statusElement.classList.add('loading');
        }

        // Add a transaction preview popup
        const previewPopup = document.createElement('div');
        previewPopup.className = 'transaction-preview';
        previewPopup.innerHTML = `
            <div class="preview-content">
                <h3>Transaction Preview</h3>
                <p class="preview-status">Preparing ${action} transaction...</p>
                <div class="preview-details">
                    <div class="preview-row"><span>Action:</span> <span>${action.toUpperCase()} ${tokenSymbol}</span></div>
                    <div class="preview-row"><span>Amount:</span> <span>${amount} ${action === 'buy' ? 'SOL' : tokenSymbol}</span></div>
                    <div class="preview-row"><span>Token:</span> <span>${tokenName}</span></div>
                    <div class="preview-row loading"><span>Expected Price:</span> <span>calculating...</span></div>
                </div>
                <div class="preview-notice">Once ready, Phantom will ask you to confirm this transaction.</div>
                <div class="preview-buttons">
                    <button class="cancel-trade">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(previewPopup);

        // Add cancel functionality
        const cancelButton = previewPopup.querySelector('.cancel-trade');
        cancelButton.addEventListener('click', () => {
            document.body.removeChild(previewPopup);
            if (statusElement) {
                statusElement.textContent = 'Transaction cancelled';
                statusElement.classList.remove('loading');
                setTimeout(() => {
                    statusElement.textContent = '';
                }, 3000);
            }
        });

        // Convert amount to lamports
        const lamports = Math.floor(amount * 1e9);

        // Determine input and output mints based on action
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const inputMint = action === 'buy' ? SOL_MINT : tokenAddress;
        const outputMint = action === 'buy' ? tokenAddress : SOL_MINT;
        const tradeAmount = action === 'buy' ? lamports : amount; // For sell, amount needs conversion based on decimals

        console.log(`Executing ${action} trade for ${tokenAddress} with ${amount} ${action === 'buy' ? 'SOL' : 'tokens'}`);

        // Step 1: Get Jupiter quote
        try {
            const previewStatus = previewPopup.querySelector('.preview-status');
            previewStatus.textContent = 'Getting price quote...';
            
            const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${tradeAmount}&slippageBps=50`;
            console.log(`Fetching quote from ${quoteUrl}`);
            const quoteResponse = await fetch(quoteUrl);
            
            if (!quoteResponse.ok) {
                throw new Error(`Quote API error: ${quoteResponse.status} ${quoteResponse.statusText}`);
            }
            
            const quoteData = await quoteResponse.json();

            if (!quoteData || quoteData.error) {
                throw new Error(`Failed to get quote: ${quoteData?.error || 'Unknown error'}`);
            }

            console.log('Quote received:', quoteData);
            
            // Update the preview with the price information
            const expectedPrice = quoteData.outAmount / (action === 'buy' ? 1 : 1e9);
            const priceRow = previewPopup.querySelector('.preview-row.loading');
            if (priceRow) {
                priceRow.classList.remove('loading');
                priceRow.innerHTML = `<span>Expected ${action === 'buy' ? 'Tokens' : 'SOL'}:</span> <span>${expectedPrice.toLocaleString(undefined, {maximumFractionDigits: action === 'buy' ? 0 : 5})}</span>`;
            }
            
            // Add a hint about expected output
            const hintRow = document.createElement('div');
            hintRow.className = 'preview-row hint';
            hintRow.innerHTML = `<span>Slippage:</span> <span>0.5%</span>`;
            const detailsSection = previewPopup.querySelector('.preview-details');
            if (detailsSection) {
                detailsSection.appendChild(hintRow);
            }

            // Step 2: Get swap transaction
            previewStatus.textContent = 'Building transaction...';
            const swapUrl = 'https://quote-api.jup.ag/v6/swap';
            console.log('Requesting swap transaction...');
            const swapResponse = await fetch(swapUrl, {
            method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quoteResponse: quoteData,
                    userPublicKey: wallet.getPublicKey().toString(),
                    wrapAndUnwrapSol: true
            })
        });

            if (!swapResponse.ok) {
                throw new Error(`Swap API error: ${swapResponse.status} ${swapResponse.statusText}`);
            }

        const swapData = await swapResponse.json();
            if (!swapData || !swapData.swapTransaction) {
            throw new Error('Failed to create swap transaction');
        }

            console.log('Swap transaction received');

            // Update the preview one more time
            previewStatus.textContent = 'Ready for approval';
            previewPopup.querySelector('.preview-notice').textContent = 'Click "Approve" in Phantom when prompted to complete this transaction.';
            
            // Update the buttons
            const buttonsSection = previewPopup.querySelector('.preview-buttons');
            buttonsSection.innerHTML = `
                <button class="cancel-trade">Cancel</button>
                <button class="continue-trade">Continue to Approval</button>
            `;
            
            // Re-add cancel functionality
            const newCancelButton = buttonsSection.querySelector('.cancel-trade');
            newCancelButton.addEventListener('click', () => {
                document.body.removeChild(previewPopup);
                if (statusElement) {
                    statusElement.textContent = 'Transaction cancelled';
                    statusElement.classList.remove('loading');
                    setTimeout(() => {
                        statusElement.textContent = '';
                    }, 3000);
                }
            });
            
            // Add continue functionality
            const continueButton = buttonsSection.querySelector('.continue-trade');
            continueButton.addEventListener('click', async () => {
                previewStatus.textContent = 'Waiting for wallet approval...';
                buttonsSection.style.display = 'none';
                
                // Step 3: Process transaction data using native browser methods
                try {
                    const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');
                    
                    // Log diagnostic information
                    console.log('Preparing to decode transaction...');
                    console.log('Native base64 decoding available:', typeof window.atob === 'function');
                    
                    // Get base64 encoded transaction data
                    const base64Data = swapData.swapTransaction;
                    console.log('Transaction data length:', base64Data.length);
                    
                    try {
                        // IMPROVED APPROACH: Use native browser atob function to decode base64
                        // This doesn't require Buffer and works in all modern browsers
                        
                        // 1. Decode base64 to binary string using browser's built-in atob
                        if (typeof window.atob !== 'function') {
                            throw new Error('Your browser does not support base64 decoding (atob function missing)');
                        }
                        
                        const binaryString = window.atob(base64Data);
                        console.log('Binary string length:', binaryString.length);
                        
                        // 2. Convert binary string to Uint8Array
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        
                        console.log('Bytes array created successfully, length:', bytes.length);
                        
                        // 3. Create transaction from bytes
                        let transaction;
                        try {
                            // Try the preferred method first
                            transaction = solanaWeb3.VersionedTransaction.deserialize(bytes);
                            console.log('Transaction deserialized successfully using VersionedTransaction');
                        } catch (deserializeError) {
                            console.warn('VersionedTransaction deserialization failed, trying alternative method:', deserializeError);
                            
                            // Fallback: Try using Transaction instead of VersionedTransaction
                            try {
                                transaction = solanaWeb3.Transaction.from(bytes);
                                console.log('Transaction deserialized successfully using Transaction.from');
                            } catch (fallbackError) {
                                console.error('Both deserialization methods failed:', fallbackError);
                                throw new Error('Failed to deserialize transaction. Your browser may not support the required features.');
                            }
                        }

                        // Step 4: Sign and send transaction
                        console.log('Sending transaction to wallet for approval...');
                        previewStatus.textContent = 'Waiting for wallet approval...';
                        
                        const signedTransaction = await wallet.signAndSendTransaction(transaction);
                        console.log('Transaction signed and sent:', signedTransaction);
                        
                        // Update preview
                        previewStatus.textContent = 'Transaction submitted!';
                        previewPopup.querySelector('.preview-notice').textContent = 'Your transaction has been submitted to the Solana network.';
                        
                        // Add transaction details and close button
                        buttonsSection.innerHTML = `
                            <a href="https://solscan.io/tx/${signedTransaction.signature}" target="_blank" class="view-explorer">View on Explorer</a>
                            <button class="close-preview">Close</button>
                        `;
                        
                        buttonsSection.style.display = 'flex';
                        buttonsSection.querySelector('.close-preview').addEventListener('click', () => {
                            document.body.removeChild(previewPopup);
                        });

                        // Step 5: Wait for confirmation and update UI
                        if (statusElement) {
                            statusElement.textContent = 'Transaction confirmed!';
                            statusElement.classList.remove('loading');
                            statusElement.classList.add('success');
                            
                            // Reset after 3 seconds
                            setTimeout(() => {
                                statusElement.textContent = '';
                                statusElement.classList.remove('success');
                            }, 3000);
                        }
                        
                        return signedTransaction.signature;
                    } catch (decodeError) {
                        console.error('Error decoding transaction:', decodeError);
                        throw new Error(`Failed to decode transaction: ${decodeError.message}`);
                    }
                } catch (txError) {
                    console.error('Transaction execution error:', txError);
                    throw new Error(`Transaction failed: ${txError.message || 'Unknown error'}`);
                }
            });
        } catch (apiError) {
            console.error('API error:', apiError);
            
            // Update the preview to show the error
            if (previewPopup.parentNode) {
                const previewStatus = previewPopup.querySelector('.preview-status');
                if (previewStatus) {
                    previewStatus.textContent = 'Error preparing transaction';
                    previewStatus.classList.add('error');
                }
                
                const buttonsSection = previewPopup.querySelector('.preview-buttons');
                if (buttonsSection) {
                    buttonsSection.innerHTML = `
                        <div class="error-message">${apiError.message || 'Unknown error'}</div>
                        <button class="close-preview">Close</button>
                    `;
                    
                    buttonsSection.querySelector('.close-preview').addEventListener('click', () => {
                        document.body.removeChild(previewPopup);
                    });
                }
            }
            
            throw new Error(`API error: ${apiError.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Trade execution failed:', error);
        
        // Show error in UI
        const statusElement = document.getElementById('trade-status');
        if (statusElement) {
            statusElement.textContent = `Error: ${error.message}`;
            statusElement.classList.remove('loading');
            statusElement.classList.add('error');
            
            // Reset after 5 seconds
            setTimeout(() => {
                statusElement.textContent = '';
                statusElement.classList.remove('error');
            }, 5000);
        }
        
        // Show alert instead of notification
        alert(`Trade Failed: ${error.message || 'Unknown error occurred'}`);
        return null;
    }
}

// Create token card
function createTokenCard(tokenInfo) {
    // Validate input to avoid errors
    if (!tokenInfo || !tokenInfo.tokenAddress) {
        console.error('Invalid token info in createTokenCard:', tokenInfo);
        throw new Error('Cannot create token card with invalid data');
    }
    
    console.log('Creating token card with data:', {
        name: tokenInfo.tokenName,
        symbol: tokenInfo.tokenSymbol,
        address: tokenInfo.tokenAddress,
        marketCap: tokenInfo.marketCap,
        marketCapType: typeof tokenInfo.marketCap
    });

    // Ensure name and symbol are provided with fallbacks
    const tokenName = tokenInfo.tokenName || 'Unknown Token';
    const tokenSymbol = tokenInfo.tokenSymbol || 'UNKNOWN';
    const tokenAddress = tokenInfo.tokenAddress;

    // Format market cap
    let marketCapDisplay = 'N/A';
    if (tokenInfo.marketCap && tokenInfo.marketCap !== 'N/A') {
        try {
            const marketCapValue = Number(tokenInfo.marketCap);
            if (!isNaN(marketCapValue)) {
                marketCapDisplay = `$${marketCapValue.toLocaleString()}`;
            }
        } catch (error) {
            console.error('Error formatting market cap:', error);
        }
    }

    // Ensure token score is a number or default to 0
    const tokenScore = !isNaN(Number(tokenInfo.tokenScore)) ? Number(tokenInfo.tokenScore) : 0;

    const card = document.createElement('div');
    card.className = 'token-card';
    card.setAttribute('data-token-address', tokenAddress);
    card.innerHTML = `
        <div class="token-header">
            <div class="token-image">
                ${tokenInfo.tokenImageUrl ? 
                    `<img src="${tokenInfo.tokenImageUrl}" alt="${tokenName}" onerror="this.src='https://via.placeholder.com/40?text=${tokenSymbol}'">` :
                    `<div class="placeholder-image">${tokenSymbol}</div>`
                }
            </div>
            <div class="token-title">
                <h3><a href="https://dexscreener.com/solana/${tokenAddress}" target="_blank">${tokenName}</a></h3>
                <span class="token-symbol">${tokenSymbol}</span>
            </div>
        </div>
        <div class="token-details">
            <p>Market Cap: ${marketCapDisplay}</p>
            <div class="safety-score">
                <span>Safety Score:</span>
                <div class="progress-bar">
                    <div class="progress" style="width: ${tokenScore}%"></div>
                </div>
                <span>${tokenScore}%</span>
            </div>
        </div>
        <div class="token-actions">
            <button id="chart-${tokenAddress}" class="token-btn chart-btn">
                <i class="fas fa-chart-bar"></i>
            </button>
            <div class="futuristic-trade-controls">
                <div class="trade-amount-container">
                    <input type="number" id="amount-${tokenAddress}" class="trade-amount" value="0.1" step="0.01" min="0.008">
                    <div class="sol-badge">SOL</div>
                </div>
                <div class="action-buttons">
                    <button id="buy-${tokenAddress}" class="circle-btn buy-btn">
                        <span class="btn-glow"></span>
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button id="sell-${tokenAddress}" class="circle-btn sell-btn">
                        <span class="btn-glow"></span>
                        <i class="fas fa-arrow-down"></i>
                </button>
            </div>
            </div>
            <div id="trade-status-${tokenAddress}" class="trade-status"></div>
        </div>
    `;

    // Add event listeners for the buttons
    try {
        const chartBtn = card.querySelector(`#chart-${tokenAddress}`);
        const buyBtn = card.querySelector(`#buy-${tokenAddress}`);
        const sellBtn = card.querySelector(`#sell-${tokenAddress}`);
        const amountInput = card.querySelector(`#amount-${tokenAddress}`);

        if (chartBtn) chartBtn.addEventListener('click', () => showChart(tokenAddress));
        
        if (buyBtn) {
            buyBtn.addEventListener('click', async () => {
                const solAmount = parseFloat(amountInput.value);
                if (isNaN(solAmount) || solAmount < 0.008) {
                    alert('Invalid Amount: Minimum amount is 0.008 SOL');
            return;
        }
                
                // Use direct trade execution for all buys
                try {
                    const tradeStatus = card.querySelector(`#trade-status-${tokenAddress}`);
                    if (tradeStatus) {
                        tradeStatus.textContent = '';
                        tradeStatus.classList.add('loading', 'quick-approval');
                    }
                    
                    // Add pulsing effect to the buy button
                    buyBtn.classList.add('pulsing');
                    
                    // Use the executeDirectTrade function with user-specified amount
                    await executeDirectTrade(tokenAddress, 'buy', solAmount);
                    
                    if (tradeStatus) {
                        tradeStatus.classList.remove('loading', 'quick-approval');
                    }
                    
                    // Remove pulsing effect
                    buyBtn.classList.remove('pulsing');
                    
                } catch (error) {
                    console.error('Buy failed:', error);
                    buyBtn.classList.remove('pulsing');
                    // Error handling is done in executeDirectTrade
                }
            });
        }
        
        if (sellBtn) {
            sellBtn.addEventListener('click', async () => {
                try {
                    const tradeStatus = card.querySelector(`#trade-status-${tokenAddress}`);
                    // For sell, we still need to get token amount since it's in different units
                    const sellAmount = prompt(`Enter amount of ${tokenSymbol} to sell:`, '10');
                    
                    if (sellAmount === null || sellAmount === '') {
                        return; // User canceled
                    }
                    
                    const amount = parseFloat(sellAmount);
                    if (isNaN(amount) || amount <= 0) {
                        alert('Invalid Amount: Please enter a valid amount');
                        return;
                    }
                    
                    if (tradeStatus) {
                        tradeStatus.textContent = '';
                        tradeStatus.classList.add('loading', 'quick-approval');
                    }
                    
                    // Add pulsing effect to the sell button
                    sellBtn.classList.add('pulsing');
                    
                    // Use the executeDirectTrade function for selling too
                    await executeDirectTrade(tokenAddress, 'sell', amount);
                    
                    if (tradeStatus) {
                        tradeStatus.classList.remove('loading', 'quick-approval');
                    }
                    
                    // Remove pulsing effect
                    sellBtn.classList.remove('pulsing');
                    
                } catch (error) {
                    console.error('Sell failed:', error);
                    sellBtn.classList.remove('pulsing');
                    // Error handling is done in executeDirectTrade
                }
            });
        }
    } catch (error) {
        console.error('Error adding event listeners to token card:', error);
    }

    return card;
}

// Function to show token info in modal
async function showTokenInfo(tokenAddress) {
    try {
        // Create and show loading modal
        const loadingModal = document.createElement('div');
        loadingModal.className = 'token-modal';
        loadingModal.innerHTML = `
            <div class="token-modal-content">
                <div class="token-modal-header">
                    <div class="token-modal-image">
                        <div class="placeholder-image">Loading...</div>
                    </div>
                    <div class="token-modal-title">
                        <h2>Loading Token Info...</h2>
                    </div>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="token-modal-body">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        `;
        document.body.appendChild(loadingModal);

        // Add close button functionality
        loadingModal.querySelector('.close-modal').addEventListener('click', () => {
            loadingModal.remove();
        });

        // Close modal when clicking outside
        loadingModal.addEventListener('click', (e) => {
            if (e.target === loadingModal) {
                loadingModal.remove();
            }
        });

        console.log('Fetching token info for:', tokenAddress);
        const response = await fetch(`/api/token/${tokenAddress}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const tokenData = await response.json();
        console.log('Received token data:', tokenData);
        
        // Remove loading modal
        loadingModal.remove();

        // Create and show data modal
        const modal = document.createElement('div');
        modal.className = 'token-modal';
        modal.innerHTML = `
            <div class="token-modal-content">
                <div class="token-modal-header">
                    <div class="token-modal-image">
                        ${tokenData.image ? 
                            `<img src="${tokenData.image}" alt="${tokenData.name}" onerror="this.src='https://via.placeholder.com/48?text=${tokenData.symbol}'">` :
                            `<div class="placeholder-image">${tokenData.symbol || '?'}</div>`
                        }
                    </div>
                    <div class="token-modal-title">
                        <h2>${tokenData.name || 'Unknown Token'}</h2>
                        <span class="token-symbol">${tokenData.symbol || 'UNKNOWN'}</span>
                    </div>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="token-modal-body">
                    <div class="token-info-grid">
                        <div class="info-item">
                            <span class="info-label">Price</span>
                            <span class="info-value">${tokenData.price ? `$${Number(tokenData.price).toFixed(4)}` : 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Market Cap</span>
                            <span class="info-value">${tokenData.marketCap ? `$${Number(tokenData.marketCap).toLocaleString()}` : 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">24h Volume</span>
                            <span class="info-value">${tokenData.volume24h ? `$${Number(tokenData.volume24h).toLocaleString()}` : 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Safety Score</span>
                            <span class="info-value">${tokenData.score ? `${Number(tokenData.score).toFixed(1)}%` : 'N/A'}</span>
                        </div>
                    </div>
                    ${tokenData.twitter || tokenData.telegram ? `
                    <div class="social-links">
                        <h3>Social Media</h3>
                        <div class="social-buttons">
                            ${tokenData.twitter ? `
                            <a href="https://twitter.com/${tokenData.twitter}" target="_blank" class="social-btn twitter">
                                <i class="fab fa-twitter"></i> Twitter
                            </a>
                            ` : ''}
                            ${tokenData.telegram ? `
                            <a href="${tokenData.telegram}" target="_blank" class="social-btn telegram">
                                <i class="fab fa-telegram"></i> Telegram
                            </a>
                            ` : ''}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close modal when clicking the close button
        modal.querySelector('.close-modal').addEventListener('click', () => {
            modal.remove();
        });

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    } catch (error) {
        console.error('Error fetching token info:', error);
        alert('Failed to load token information. Please try again later.');
    }
}

// Helper functions for other buttons
function openExplorer(url) {
    window.open(url, '_blank');
}

function openDexScreener(url) {
    window.open(url, '_blank');
}

function openTrade(url) {
    window.open(url, '_blank');
}

// Function to show chart in new window
function showChart(tokenAddress) {
    const tokenCard = document.querySelector(`[data-token-address="${tokenAddress}"]`);
    const tokenName = tokenCard.querySelector('h3').textContent;
    const tokenSymbol = tokenCard.querySelector('.token-symbol').textContent;
    const tokenImage = tokenCard.querySelector('.token-image img')?.src || '';
    
    const chartUrl = `/chart.html?address=${tokenAddress}&name=${encodeURIComponent(tokenName)}&symbol=${encodeURIComponent(tokenSymbol)}&image=${encodeURIComponent(tokenImage)}`;
    window.open(chartUrl, '_blank', 'width=1200,height=800');
}

// Handle monitoring status updates
socket.on('monitoringStarted', (data) => {
    console.log('Received monitoringStarted event:', data);
    
    // Clear the monitoring timeout if it exists
    if (monitoringTimeout) {
        clearTimeout(monitoringTimeout);
        monitoringTimeout = null;
    }
    
    if (data.success) {
        console.log('Monitoring started successfully');
        
        // Update the status in the UI
        const statusElement = document.querySelector('.status-text');
        if (statusElement) {
            statusElement.innerText = 'Monitoring active';
            statusElement.classList.remove('connecting');
            statusElement.classList.add('success');
        }
        
        // Update button states
        document.getElementById('startMonitoring').disabled = true;
        document.getElementById('stopMonitoring').disabled = false;
        
        // Show notification to user
        console.log('Monitoring Active: Token monitoring has started successfully. New tokens will appear automatically.');
        
        // Save monitoring state
        localStorage.setItem('monitoringActive', 'true');
        
        // If server sent initial tokens, display them
        if (data.recentTokens && data.recentTokens.length > 0) {
            console.log('Received recent tokens:', data.recentTokens);
            displayTokens(data.recentTokens);
        }
    } else {
        console.error('Failed to start monitoring:', data.error);
        resetMonitoringUI();
        console.error('Monitoring Failed: Token monitoring failed to start. Error:', data.error || 'Unknown error starting monitoring');
    }
});

socket.on('monitoringStopped', (data) => {
    console.log('Received monitoringStopped event:', data);
    if (data.success) {
        console.log('Monitoring stopped successfully');
        
        // Update the UI
        const statusElement = document.querySelector('.status-text');
        if (statusElement) {
            statusElement.innerText = 'Monitoring stopped';
            statusElement.classList.remove('success', 'connecting');
        }
        
        // Update button states
        document.getElementById('startMonitoring').disabled = false;
        document.getElementById('stopMonitoring').disabled = true;
        
        // Show notification
        console.log('Monitoring Stopped: Token monitoring has been stopped.');
        
        // Clear monitoring state
        localStorage.removeItem('monitoringActive');
    } else {
        console.error('Failed to stop monitoring:', data.error);
        console.error('Stop Failed: Token monitoring failed to stop. Error:', data.error || 'Unknown error stopping monitoring');
        resetMonitoringUI();
    }
});

// Handle new token notifications
socket.on('newToken', (tokenInfo) => {
    console.log('New token detected:', tokenInfo);
    try {
    handleNewToken(tokenInfo);
    } catch (error) {
        console.error('Error handling new token:', error);
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check for critical dependencies
    console.log('Checking for required dependencies...');
    
    // Check if we have the minimum required functionality for transactions
    const hasAtob = typeof window.atob === 'function';
    const hasSolanaWeb3 = typeof solanaWeb3 !== 'undefined';
    
    console.log('Dependency check:', {
        hasAtob,
        hasSolanaWeb3
    });
    
    // Warn about missing dependencies that might affect functionality
    if (!hasAtob) {
        console.error('Missing critical dependency: window.atob is not available');
        console.error('Critical Dependency Missing: Your browser does not support the required base64 functionality. Trading will not work correctly.');
    }
    
    if (!hasSolanaWeb3) {
        console.error('Missing critical dependency: solanaWeb3 is not available');
        console.error('Critical Dependency Missing: Solana Web3 library failed to load. Trading will not work correctly. Please try refreshing the page.');
    }
    
    // Restore saved token source selection from localStorage
    try {
        const savedSources = localStorage.getItem('selectedSources');
        if (savedSources) {
            const sources = JSON.parse(savedSources);
            console.log('Restoring saved token sources:', sources);
            
            // Set checkboxes based on saved values
            if (sources.rayFee !== undefined) {
                document.getElementById('sourceRayFee').checked = sources.rayFee;
            }
            if (sources.pumpFun !== undefined) {
                document.getElementById('sourcePumpFun').checked = sources.pumpFun;
            }
            if (sources.moonshot !== undefined) {
                document.getElementById('sourceMoonshot').checked = sources.moonshot;
            }
            if (sources.raydium !== undefined) {
                document.getElementById('sourceRaydium').checked = sources.raydium;
            }
            if (sources.jupiter !== undefined) {
                document.getElementById('sourceJupiter').checked = sources.jupiter;
            }
        }
    } catch (e) {
        console.error('Error restoring token sources:', e);
    }
    
    // Show loading animation initially
    const loadingElement = document.querySelector('.loading');
    if (loadingElement) {
        loadingElement.classList.add('initial-load');
    }
    
    console.log('Fetching initial tokens...');
    
    // Fetch initial tokens
    fetch('/api/tokens/latest')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Received initial tokens:', data);
            
            if (data.tokens && data.tokens.length > 0) {
                // Display each token one at a time for a better visual effect
                data.tokens.forEach((token, index) => {
                    setTimeout(() => {
                        try {
                    handleNewToken(token);
                        } catch (e) {
                            console.error('Error handling token:', e);
                        }
                    }, index * 300); // Stagger the display of tokens
                });
            } else {
                console.log('No initial tokens received');
                // Make sure the loading element shows the right message
            if (loadingElement) {
                    loadingElement.textContent = 'No tokens found. Start monitoring to detect new tokens.';
                loadingElement.classList.remove('initial-load');
                }
            }
        })
        .catch(error => {
            console.error('Error fetching initial tokens:', error);
            if (loadingElement) {
                loadingElement.textContent = 'Error loading tokens. Please try again.';
                loadingElement.classList.remove('initial-load');
            }
            alert('Loading Error: Failed to load initial tokens. Please refresh the page.');
        });
}); 

// Add listeners for monitoring buttons
document.addEventListener('DOMContentLoaded', function() {
  const startMonitoringBtn = document.getElementById('startMonitoring');
  const stopMonitoringBtn = document.getElementById('stopMonitoring');
  
  if (startMonitoringBtn) {
    startMonitoringBtn.addEventListener('click', startMonitoring);
  }
  
  if (stopMonitoringBtn) {
    stopMonitoringBtn.addEventListener('click', stopMonitoring);
  }
  
  // Check if monitoring was active in previous session
  if (localStorage.getItem('monitoringActive') === 'true') {
    console.log('Restoring monitoring session from previous visit');
    // Small delay to ensure socket is connected
    setTimeout(startMonitoring, 1000);
  }
});

// Function to reset monitoring UI if server doesn't respond
function resetMonitoringUI() {
  const startMonitoringBtn = document.getElementById('startMonitoring');
  const stopMonitoringBtn = document.getElementById('stopMonitoring');
  
  if (startMonitoringBtn) startMonitoringBtn.disabled = false;
  if (stopMonitoringBtn) stopMonitoringBtn.disabled = true;
  
  const statusElement = document.querySelector('.status-text');
  if (statusElement) {
    statusElement.innerText = 'Disconnected';
    statusElement.classList.remove('connecting');
  }
  
  console.error('Monitoring Failed: Server did not respond. Please try again.');
  localStorage.removeItem('monitoringActive');
}

// Function to stop token monitoring
function stopMonitoring() {
  console.log('Stopping token monitoring...');
  
  // Update UI
  document.getElementById('stopMonitoring').disabled = true;
  
  // Update status
  const statusElement = document.querySelector('.status-text');
  if (statusElement) {
    statusElement.innerText = 'Stopping monitoring...';
  }
  
  // Emit stop event
  socket.emit('stopMonitoring');
  
  // Set timeout in case server doesn't respond
  setTimeout(() => {
    console.log('No stop response from server, resetting UI anyway');
    
    // Reset UI
    document.getElementById('startMonitoring').disabled = false;
    document.getElementById('stopMonitoring').disabled = true;
    
    if (statusElement) {
      statusElement.innerText = 'Monitoring stopped';
      statusElement.classList.remove('success', 'connecting');
    }
    
    // Clear storage
    localStorage.removeItem('monitoringActive');
  }, 5000);
} 