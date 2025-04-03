// Phantom wallet integration
class PhantomWallet {
    constructor() {
        this.provider = null;
        this.connected = false;
        this.publicKey = null;
        this.connectButton = document.getElementById('connectWallet');
        this.walletAddress = document.getElementById('walletAddress');
        this.statusDot = document.querySelector('.status-dot');
        this.statusText = document.querySelector('.status-text');
        
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 3;
        this.connectionTimeout = null;
        this.providerDetectionRetries = 0; // Track provider detection retries
        this.lastDiagnosticCheck = null;
        
        // Check for stored connection state
        this.checkStoredState();
        
        // Use a slight delay to ensure the wallet extension is fully loaded
        setTimeout(() => {
        this.initializeWallet();
            
            // Run diagnostic after initialization
            setTimeout(() => this.runDiagnostic(), 2000);
        }, 800); // Increased delay from 500ms to 800ms
    }
    
    // Diagnostic function to identify wallet issues
    async runDiagnostic() {
        try {
            console.group('Phantom Wallet Diagnostic');
            this.lastDiagnosticCheck = new Date().toISOString();
            
            // Check if Phantom is available at all
            console.log('Checking for Phantom provider availability...');
            const hasWindowPhantom = 'phantom' in window;
            const hasWindowSolana = 'solana' in window;
            console.log('- window.phantom exists:', hasWindowPhantom);
            console.log('- window.solana exists:', hasWindowSolana);
            
            if (hasWindowPhantom) {
                console.log('- window.phantom.solana exists:', window.phantom?.solana !== undefined);
            }
            
            if (hasWindowSolana) {
                console.log('- window.solana.isPhantom:', window.solana?.isPhantom);
            }
            
            // Check provider state
            console.log('Provider state:');
            console.log('- this.provider exists:', this.provider !== null);
            if (this.provider) {
                console.log('- provider.isPhantom:', this.provider.isPhantom);
                console.log('- provider.isConnected:', this.provider.isConnected);
                console.log('- provider has publicKey:', this.provider.publicKey !== undefined);
                
                // Test if provider methods are callable
                console.log('Testing provider methods:');
                try {
                    const listeners = this.provider.listeners('connect');
                    console.log('- connect listeners count:', listeners.length);
                } catch (e) {
                    console.error('- Error checking listeners:', e);
                }
            }
            
            // Check UI state
            console.log('UI state:');
            console.log('- connectButton exists:', this.connectButton !== null);
            console.log('- walletAddress exists:', this.walletAddress !== null);
            console.log('- statusDot exists:', this.statusDot !== null);
            console.log('- statusText exists:', this.statusText !== null);
            
            if (this.connectButton) {
                console.log('- connectButton text:', this.connectButton.textContent);
                console.log('- connectButton has handlers:', this.connectButton.onclick !== null);
            }
            
            // Check internal state
            console.log('Internal state:');
            console.log('- this.connected:', this.connected);
            console.log('- this.publicKey exists:', this.publicKey !== null);
            console.log('- this.connectionAttempts:', this.connectionAttempts);
            console.log('- this.providerDetectionRetries:', this.providerDetectionRetries);
            
            // Check localStorage
            console.log('LocalStorage state:');
            try {
                const storedState = localStorage.getItem('phantomConnection');
                console.log('- phantomConnection exists:', storedState !== null);
                if (storedState) {
                    const parsedState = JSON.parse(storedState);
                    console.log('- wasConnected:', parsedState.wasConnected);
                    console.log('- timestamp:', new Date(parsedState.timestamp).toISOString());
                    console.log('- age:', (Date.now() - parsedState.timestamp) / 1000, 'seconds');
                }
            } catch (e) {
                console.error('- Error checking localStorage:', e);
            }
            
            console.groupEnd();
            
            return {
                hasPhantom: hasWindowPhantom || hasWindowSolana,
                providerDetected: this.provider !== null,
                connected: this.connected,
                uiReady: this.connectButton !== null && this.statusDot !== null
            };
        } catch (e) {
            console.error('Diagnostic error:', e);
            console.groupEnd();
            return {
                error: e.message,
                hasPhantom: false,
                providerDetected: false,
                connected: false,
                uiReady: false
            };
        }
    }
    
    // Check if we have a stored connection state
    checkStoredState() {
        try {
            const storedState = localStorage.getItem('phantomConnection');
            if (storedState) {
                const parsedState = JSON.parse(storedState);
                if (parsedState.wasConnected) {
                    console.log('Found stored connection state, will attempt reconnect');
                    // Don't set connected flag yet, just mark for reconnection attempt
                    this.shouldReconnect = true;
                }
            }
        } catch (e) {
            console.error('Error checking stored state:', e);
        }
    }
    
    // Store connection state for persistence
    storeConnectionState(isConnected) {
        try {
            localStorage.setItem('phantomConnection', JSON.stringify({
                wasConnected: isConnected,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.error('Error storing connection state:', e);
        }
    }

    async initializeWallet() {
        // Check if we're on mobile
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        try {
            // Detect wallet provider with better error handling and retry logic
            await this.detectProvider();
            
            if (!this.provider) {
                console.log('No Phantom provider detected after retries');
                
                // Set button to install state for desktop or open for mobile
                if (isMobile) {
                    this.connectButton.textContent = 'Open in Phantom';
                this.connectButton.onclick = () => {
                    const link = `https://phantom.app/ul/browse/${window.location.href}`;
                    window.location.href = link;
                };
                } else {
                    this.connectButton.textContent = 'Install Phantom';
                    this.connectButton.onclick = () => window.open('https://phantom.app/', '_blank');
                }
                return;
            }

            // If provider is found, set up listeners
            if (this.provider) {
                // Give the provider a moment to initialize
                await new Promise(resolve => setTimeout(resolve, 300));
                this.setupEventListeners();
                
                // Check if already connected
                if (this.provider.isConnected && this.provider.publicKey) {
                    console.log('Provider is already connected with public key:', this.provider.publicKey);
                    this.connected = true;
                    this.publicKey = this.provider.publicKey;
                    this.updateUI();
                    this.storeConnectionState(true);
                    
                    // Dispatch event for other components
                    window.dispatchEvent(new CustomEvent('walletConnected', { 
                        detail: { publicKey: this.publicKey } 
                    }));
                } else if (this.shouldReconnect) {
                    console.log('Attempting to reconnect from stored state');
                    // Do this after a small delay to ensure everything is initialized
                    setTimeout(() => this.connect(), 1000);
                } else {
                    console.log('Provider found but not connected');
                }
            }
        } catch (error) {
            console.error('Error initializing wallet:', error);
            // Still set up the button in case of error
            this.connectButton.textContent = isMobile ? 'Open in Phantom' : 'Connect Phantom';
            
            // Set a simple click handler that will try to re-initialize
            this.connectButton.onclick = async () => {
                console.log('Retrying wallet initialization...');
                this.providerDetectionRetries = 0;
                await this.detectProvider();
                if (this.provider) {
                    this.setupEventListeners();
                    await this.connect();
                } else {
                    alert('Phantom wallet not detected. Please install or enable the extension.');
                }
            };
        }
    }
    
    async detectProvider(maxRetries = 3) {
        this.providerDetectionRetries = 0;
        
        // Clear provider to ensure a fresh start
        this.provider = null;
        
        console.log('Starting provider detection sequence...');
        
        // First, wait a moment to ensure the browser has had time to initialize extensions
        await new Promise(resolve => setTimeout(resolve, 300));
        
        while (this.providerDetectionRetries < maxRetries && !this.provider) {
            console.log(`Attempting to detect Phantom provider (attempt ${this.providerDetectionRetries + 1}/${maxRetries})`);
            
            // Check for different provider possibilities
            const possibleProviders = [
                { name: 'window.phantom?.solana', provider: window.phantom?.solana },
                { name: 'window.solana (isPhantom)', provider: window.solana?.isPhantom ? window.solana : null }
            ];
            
            // Log what we find
            console.log('Provider check results:');
            possibleProviders.forEach(p => {
                console.log(`- ${p.name}: ${p.provider ? 'FOUND' : 'NOT FOUND'}`);
            });
            
            // Try each possible provider location
            for (const { name, provider } of possibleProviders) {
                if (provider) {
                    console.log(`Provider found at ${name}`);
                    
                    // Verify the provider has the expected methods
                    if (typeof provider.connect === 'function' && 
                        typeof provider.disconnect === 'function') {
                        this.provider = provider;
                        console.log('Provider appears valid with required methods');
                        return; // Exit successfully
                    } else {
                        console.warn(`Provider at ${name} is missing required methods`);
                    }
                }
            }
            
            // If we're here, no valid provider was found in this attempt
            this.providerDetectionRetries++;
            
            if (this.providerDetectionRetries < maxRetries) {
                const waitTime = 800 * this.providerDetectionRetries; // Increasing wait time with each retry
                console.log(`Provider not found, waiting ${waitTime}ms before retry ${this.providerDetectionRetries}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        if (!this.provider) {
            console.error('Failed to detect Phantom provider after maximum retries');
            
            // Last ditch effort - check if wallet appears in any form
            if ('phantom' in window) {
                console.log('window.phantom exists but not in expected format, attempting recovery');
                
                try {
                    // If window.phantom exists but solana doesn't, see if we can find any usable properties
                    const phantomKeys = Object.keys(window.phantom);
                    console.log('Available window.phantom keys:', phantomKeys);
                    
                    // Try using window.phantom directly if desperate
                    if (window.phantom && typeof window.phantom.connect === 'function') {
                        console.log('Using window.phantom directly as a fallback');
                        this.provider = window.phantom;
                        return;
                    }
                } catch (e) {
                    console.error('Error in provider recovery attempt:', e);
                }
            }
            
            // Final check for Solana
            if ('solana' in window) {
                console.log('window.solana exists, investigating properties');
                try {
                    console.log('Solana properties:', Object.keys(window.solana).join(', '));
                    
                    // Check if this might be a usable provider despite missing isPhantom flag
                    if (typeof window.solana.connect === 'function' && 
                        typeof window.solana.disconnect === 'function') {
                        console.log('Using window.solana as a fallback provider');
                        this.provider = window.solana;
                        return;
                    }
                } catch (e) {
                    console.error('Error in solana provider inspection:', e);
                }
            }
        }
    }

    setupEventListeners() {
        try {
            // Clear any existing event handlers to prevent duplicates
            this.resetEventListeners();
            
            // Re-setup the button
            this.connectButton.onclick = null;
            
        // Handle connection changes
            this.provider.on('connect', (publicKey) => {
                console.log('Wallet connected event received:', publicKey);
            this.connected = true;
                this.publicKey = publicKey || this.provider.publicKey;
                this.connectionAttempts = 0; // Reset connection attempts on success
            this.updateUI();
                this.storeConnectionState(true);
                
                // Dispatch a custom event that other parts of the app can listen for
                window.dispatchEvent(new CustomEvent('walletConnected', { 
                    detail: { publicKey: this.publicKey } 
                }));
        });

        this.provider.on('disconnect', () => {
                console.log('Wallet disconnected event received');
            this.connected = false;
            this.publicKey = null;
            this.updateUI();
                this.storeConnectionState(false);
                
                // Dispatch a custom event that other parts of the app can listen for
                window.dispatchEvent(new CustomEvent('walletDisconnected'));
        });

        // Handle account changes
        this.provider.on('accountChanged', (publicKey) => {
                console.log('Account changed event received:', publicKey);
            if (publicKey) {
                this.publicKey = publicKey;
                this.connected = true;
                    this.storeConnectionState(true);
            } else {
                this.publicKey = null;
                this.connected = false;
                    this.storeConnectionState(false);
            }
            this.updateUI();
                // Dispatch a custom event that other parts of the app can listen for
                if (publicKey) {
                    window.dispatchEvent(new CustomEvent('walletAccountChanged', { 
                        detail: { publicKey } 
                    }));
                }
            });

            // Connect button click handler - UPDATED with direct connection fallback
            this.connectButton.onclick = async () => {
                try {
                    if (!this.connected) {
                        console.log('Connect button clicked');
                        
                        // First try our standard connection method
                        const success = await this.connect();
                        
                        // If that fails, try the direct method
                        if (!success) {
                            console.log('Standard connection failed, trying direct method');
                            await this.directConnect();
                        }
                    } else {
                        console.log('Disconnect button clicked');
                        await this.disconnect();
                    }
                } catch (err) {
                    console.error('Connection button error:', err);
                    // Try direct method as last resort
                    console.log('Error in connection, trying direct method as last resort');
                    await this.directConnect();
                }
            };
            
            // Handle page visibility changes to detect when user comes back to the page
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.connected && !this.publicKey) {
                    console.log('Page became visible again, checking wallet connection...');
                    this.checkConnection();
                }
            });
            
            // Handle beforeunload to clean up connection state
            window.addEventListener('beforeunload', () => {
                // Don't actually do anything here - we want to preserve the connection state
                // This is just to make sure we have a hook for the future if needed
            });
        } catch (error) {
            console.error('Error setting up event listeners:', error);
            this.handleEventListenerError(error);
        }
    }
    
    // Clean up event listeners to avoid duplicates
    resetEventListeners() {
        try {
            if (this.provider) {
                // Remove all listeners
                this.provider.removeAllListeners('connect');
                this.provider.removeAllListeners('disconnect');
                this.provider.removeAllListeners('accountChanged');
            }
        } catch (error) {
            console.error('Error resetting event listeners:', error);
        }
    }
    
    // Handle errors in event listener setup
    handleEventListenerError(error) {
        console.error('Error in event listeners:', error);
        
        // Attempt recovery by reinitializing
        setTimeout(() => {
            console.log('Attempting recovery after event listener error');
            this.detectProvider().then(() => {
                if (this.provider) {
                    this.setupEventListeners();
                }
            });
        }, 1000);
    }
    
    async checkConnection() {
        try {
            console.log('Checking current connection status...');
            
            // If we think we're connected but the provider disagrees, try to reconnect
            if (this.connected && this.provider && !this.provider.isConnected) {
                console.log('Connection state mismatch - reconnecting...');
                // Reset state and try to connect again
                this.connected = false;
                this.publicKey = null;
                await this.connect();
            }
        } catch (error) {
            console.error('Error checking connection:', error);
        }
    }

    async connect() {
        // Run diagnostic if we've had multiple connection attempts
        if (this.connectionAttempts >= 2) {
            console.log('Multiple connection attempts detected, running diagnostic...');
            await this.runDiagnostic();
        }
        
        if (this.connectionAttempts >= this.maxConnectionAttempts) {
            console.log('Maximum connection attempts reached');
            const message = 'Too many failed connection attempts. Please refresh the page and try again.';
            
            alert(`Connection Error: ${message}`);
            return false;
        }
        
        // Clear any existing timeout
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        
        this.connectionAttempts++;
        
        try {
            console.log('Attempting to connect to Phantom... (Attempt ' + this.connectionAttempts + ')');
            
            // Check if provider exists before trying to connect
            if (!this.provider) {
                console.error('No Phantom provider available, attempting to detect...');
                
                // Try to reinitialize the provider with extended wait time
                await this.detectProvider(4); // Increase max retries for connect attempts
                
                if (!this.provider) {
                    // Make an absolute last-ditch attempt to find any provider
                    console.warn('Still no provider found, checking for any wallet provider...');
                    
                    // Try all possibilities
                    if (window.phantom?.solana) {
                        this.provider = window.phantom.solana;
                        console.log('Final attempt: Found provider in window.phantom.solana');
                    } else if (window.solana) {
                        this.provider = window.solana;
                        console.log('Final attempt: Using window.solana as provider');
                    } else {
                        throw new Error('Phantom wallet not installed or available');
                    }
                }
                
                // Re-setup event listeners if we got a new provider
                this.setupEventListeners();
                
                // Add extra delay to ensure provider is ready
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Check if we're already connected - this can happen if the wallet state got out of sync
            if (this.provider.isConnected && this.provider.publicKey) {
                console.log('Provider is already connected, using existing connection');
                this.connected = true;
                this.publicKey = this.provider.publicKey;
                this.connectionAttempts = 0; // Reset on success
                this.storeConnectionState(true);
                this.updateUI();
                
                // Dispatch event for other components
                window.dispatchEvent(new CustomEvent('walletConnected', { 
                    detail: { publicKey: this.publicKey } 
                }));
                
                return true;
            }
            
            // Show connecting status in UI
            this.statusDot.style.background = '#ff9900'; // Orange for connecting
            this.statusText.textContent = 'Connecting...';
            
            // Set a timeout to handle stuck connections
            this.connectionTimeout = setTimeout(() => {
                if (!this.connected) {
                    console.log('Connection attempt timed out');
                    // Update UI to show error
                    this.statusDot.style.background = 'var(--error-color)';
                    this.statusText.textContent = 'Connection Timed Out';
                    
                    alert('Connection Error: Connection attempt timed out. Please try again.');
                }
            }, 25000); // Increased timeout to 25 seconds
            
            // Try to connect to the wallet with enhanced error handling
            let resp;
            try {
                // First, verify the connect method exists
                if (typeof this.provider.connect !== 'function') {
                    throw new Error('Wallet provider is missing connect method');
                }
                
                // Check for methods to determine if other wallet adapters might be interfering
                const hasMultipleAdapters = window.solana && window.phantom && window.solana !== window.phantom.solana;
                if (hasMultipleAdapters) {
                    console.warn('Multiple wallet adapters detected, this may cause connection issues');
                }
                
                console.log('Calling provider.connect() method...');
                resp = await Promise.race([
                    this.provider.connect({ onlyIfTrusted: false }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Internal connection timeout')), 20000)
                    )
                ]);
                
                console.log('Connect response received:', resp);
            } catch (connectError) {
                // If there was an error in the connect method itself, handle it specially
                console.error('Inner connection error:', connectError);
                
                if (connectError.code === 4001) {
                    throw connectError; // User rejected, pass this through
                }
                
                // For timeout errors, try a re-detection approach
                if (connectError.message && connectError.message.includes('timeout')) {
                    console.log('Connection timed out, attempting provider recovery...');
                    
                    // Reset the provider and try again
                    this.provider = null;
                    await this.detectProvider(3);
                    
                    if (this.provider) {
                        console.log('Provider recovered, checking connection state...');
                        
                        // Check if we're now connected somehow
                        if (this.provider.isConnected && this.provider.publicKey) {
                            console.log('Provider is already connected after recovery');
                            resp = { publicKey: this.provider.publicKey };
                        } else {
                            throw new Error('Provider recovered but still cannot connect. Please try again.');
                        }
                    } else {
                        throw new Error('Wallet connection timed out and recovery failed');
                    }
                }
                // For other errors, try a different approach
                else if (this.provider.publicKey && this.provider.isConnected) {
                    console.log('Connect failed but provider already has a connection, using that');
                    resp = { publicKey: this.provider.publicKey };
                } else {
                    throw connectError; // Rethrow if we can't recover
                }
            }
            
            console.log('Connected successfully:', resp);
            
            // Clear timeout since we connected successfully
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }
            
            // Make sure we have a publicKey
            if (!resp || !resp.publicKey) {
                throw new Error('Connect succeeded but no public key was returned');
            }
            
            // Update state
            this.connected = true;
            this.publicKey = resp.publicKey;
            this.connectionAttempts = 0; // Reset on success
            
            // Store connection state
            this.storeConnectionState(true);
            
            // Update UI
            this.updateUI();
            
            return true;
        } catch (err) {
            console.error('Error connecting to Phantom wallet:', err);
            
            // Clear timeout since we got an error response
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }
            
            // More detailed error message based on error type
            let errorMsg = 'Failed to connect to Phantom wallet. ';
            
            if (err.code === 4001) {
                errorMsg += 'Connection request was rejected by user.';
            } else if (err.message && err.message.includes('timeout')) {
                errorMsg += 'Connection timed out. Please check your wallet extension is responsive.';
            } else if (err.message && err.message.includes('already in progress')) {
                errorMsg += 'Another connection attempt is already in progress. Please wait or refresh the page.';
                
                // Special handling for in-progress errors
                setTimeout(() => {
                    // Check if we somehow got connected during the wait
                    if (this.provider && this.provider.isConnected && this.provider.publicKey) {
                        console.log('Connection detected after in-progress error, updating state');
                        this.connected = true;
                        this.publicKey = this.provider.publicKey;
                        this.updateUI();
                        this.storeConnectionState(true);
                        
                        // Dispatch event
                        window.dispatchEvent(new CustomEvent('walletConnected', { 
                            detail: { publicKey: this.provider.publicKey } 
                        }));
                    }
                }, 3000);
            } else if (!err.message) {
                errorMsg += 'Unexpected error occurred. Please try refreshing the page.';
            } else {
                errorMsg += err.message;
            }
            
            // Attempt recovery for specific errors
            if (err.message && (err.message.includes('unexpected') || err.message.includes('unable'))) {
                errorMsg += ' Trying to reconnect...';
                
                // Show notification but attempt auto-recovery
                alert(`Connection Issue: ${errorMsg}`);
                
                // Try reinitializing the wallet after a delay
                setTimeout(async () => {
                    console.log('Attempting recovery from connection error');
                    
                    // Try again with a fresh provider detection
                    this.provider = null;
                    await this.detectProvider(3);
                    
                    if (this.provider) {
                        this.resetEventListeners();
                        this.setupEventListeners();
                        
                        // Check if we're already connected
                        if (this.provider.isConnected && this.provider.publicKey) {
                            console.log('Provider is already connected after recovery');
                            this.connected = true;
                            this.publicKey = this.provider.publicKey;
                            this.connectionAttempts = 0;
                            this.storeConnectionState(true);
                            this.updateUI();
                            
                            // Dispatch event
                            window.dispatchEvent(new CustomEvent('walletConnected', { 
                                detail: { publicKey: this.provider.publicKey } 
                            }));
                            
                            // Show notification about successful recovery
                            alert('Connection Recovered: Your wallet connection has been restored.');
                        }
                    }
                }, 2000);
                
                // Update UI to show waiting state
                this.statusDot.style.background = '#ff9900'; // Orange for waiting
                this.statusText.textContent = 'Reconnecting...';
                
                return false;
            }
            
            // Update UI to show error
            this.statusDot.style.background = 'var(--error-color)';
            this.statusText.textContent = 'Connection Failed';
            
            alert(`Connection Error: ${errorMsg}`);
            
            return false;
        }
    }

    async disconnect() {
        try {
            // Show disconnecting status
            this.statusDot.style.background = '#ff9900'; // Orange for transition
            this.statusText.textContent = 'Disconnecting...';
            
            await this.provider.disconnect();
            this.connected = false;
            this.publicKey = null;
            
            // Update stored state
            this.storeConnectionState(false);
            
            this.updateUI();
            return true;
        } catch (err) {
            console.error('Disconnect error:', err);
            
            // If the error is because we're already disconnected, just update state
            if (err.message && err.message.includes('not connected')) {
                console.log('Already disconnected, updating state');
                this.connected = false;
                this.publicKey = null;
                this.storeConnectionState(false);
                this.updateUI();
                return true;
            }
            
            alert(`Disconnect Error: ${err.message || 'Unknown error'}`);
            return false;
        }
    }

    updateUI() {
        if (this.connected && this.publicKey) {
            this.connectButton.textContent = 'Disconnect';
            this.connectButton.classList.add('connected');
            this.connectButton.classList.remove('connecting');
            this.walletAddress.textContent = this.publicKey.toString().slice(0, 4) + '...' + this.publicKey.toString().slice(-4);
            this.statusDot.style.background = 'var(--success-color)';
            this.statusText.textContent = 'Connected';
            this.statusDot.parentElement.classList.add('online');
        } else {
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            this.connectButton.textContent = isMobile ? 'Open in Phantom' : 'Connect Phantom';
            this.connectButton.classList.remove('connected');
            this.connectButton.classList.remove('connecting');
            this.walletAddress.textContent = '';
            this.statusDot.style.background = 'var(--error-color)';
            this.statusText.textContent = 'Disconnected';
            this.statusDot.parentElement.classList.remove('online');
        }
    }

    async signTransaction(transaction) {
        try {
            if (!this.connected || !this.publicKey) {
                const connected = await this.connect();
                if (!connected) throw new Error('Wallet not connected');
            }
            return await this.provider.signTransaction(transaction);
        } catch (err) {
            console.error('Transaction signing error:', err);
            throw err;
        }
    }

    async signAllTransactions(transactions) {
        try {
            if (!this.connected || !this.publicKey) {
                const connected = await this.connect();
                if (!connected) throw new Error('Wallet not connected');
            }
            return await this.provider.signAllTransactions(transactions);
        } catch (err) {
            console.error('Multiple transaction signing error:', err);
            throw err;
        }
    }

    async signAndSendTransaction(transaction) {
        try {
            if (!this.connected || !this.publicKey) {
                const connected = await this.connect();
                if (!connected) throw new Error('Wallet not connected');
            }
            
            console.log('Sending transaction to Phantom for approval...');
            
            // Make sure the transaction is properly formatted
            if (!transaction) {
                throw new Error('Transaction is undefined or null');
            }
            
            // Sign and send the transaction using the wallet adapter
            const signed = await this.provider.signAndSendTransaction(transaction);
            console.log('Transaction signed and sent:', signed);
            return signed;
        } catch (err) {
            console.error('Transaction signing and sending error:', err);
            
            // More specific error handling
            let errorMsg = 'Failed to sign and send transaction: ';
            
            if (err.code === 4001) {
                errorMsg += 'Transaction was rejected by user.';
            } else if (err.message && err.message.includes('timeout')) {
                errorMsg += 'Transaction signing timed out. Please check your wallet extension.';
            } else {
                errorMsg += err.message || 'Unknown error occurred.';
            }
            
            throw new Error(errorMsg);
        }
    }

    // Check if wallet is connected
    isConnected() {
        return this.connected && this.publicKey !== null;
    }

    // Get the current public key
    getPublicKey() {
        return this.publicKey;
    }
    
    // Expose method to check wallet installation
    isPhantomInstalled() {
        return window.phantom?.solana !== undefined || (window.solana && window.solana.isPhantom);
    }
    
    // Get wallet provider name
    getProviderName() {
        if (window.phantom?.solana) {
            return 'Phantom (window.phantom.solana)';
        } else if (window.solana?.isPhantom) {
            return 'Phantom (window.solana)';
        }
        return 'Unknown';
    }

    // Direct connection - simplified fallback approach
    async directConnect() {
        console.log('Attempting direct connection to Phantom');
        
        try {
            // Clear state
            this.connected = false;
            this.publicKey = null;
            
            // Check for wallet in the simplest way
            const provider = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
            
            if (!provider) {
                console.error('No Phantom provider found');
                alert('Phantom wallet not found. Please install the extension and refresh.');
                return false;
            }
            
            // Simple connection attempt
            console.log('Provider found, attempting direct connection');
            const resp = await provider.connect();
            console.log('Direct connection response:', resp);
            
            if (resp && resp.publicKey) {
                // Success!
                this.provider = provider;
                this.connected = true;
                this.publicKey = resp.publicKey;
                this.updateUI();
                
                // Dispatch event
                window.dispatchEvent(new CustomEvent('walletConnected', { 
                    detail: { publicKey: this.publicKey } 
                }));
                
                return true;
            } else {
                console.error('Direct connection failed - no public key returned');
                return false;
            }
        } catch (err) {
            console.error('Direct connection error:', err);
            alert(`Connection error: ${err.message || 'Unknown error'}`);
            return false;
        }
    }
}

// Initialize wallet when the page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Phantom wallet integration');
    window.phantomWallet = new PhantomWallet();
});

// Export for use in other files
window.wallet = window.phantomWallet; 