// DOM Elements
const startMonitoringBtn = document.getElementById('startMonitoring');
const stopMonitoringBtn = document.getElementById('stopMonitoring');
const createWalletBtn = document.getElementById('createWallet');
const refreshTokensBtn = document.getElementById('refreshTokens');
const tokenList = document.getElementById('tokenList');
const connectionStatus = document.getElementById('connectionStatus');
const monitoringStatus = document.getElementById('monitoringStatus');
const lastUpdated = document.getElementById('lastUpdated');
const tokenModal = document.getElementById('tokenModal');
const walletModal = document.getElementById('walletModal');
const submitWalletCreateBtn = document.getElementById('submitWalletCreate');
const pinInput = document.getElementById('pinInput');
const pinConfirm = document.getElementById('pinConfirm');
const walletResult = document.getElementById('walletResult');

// Close buttons for modals
const closeButtons = document.querySelectorAll('.close');
closeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tokenModal.style.display = 'none';
    walletModal.style.display = 'none';
  });
});

// Close modal when clicking outside
window.addEventListener('click', (event) => {
  if (event.target === tokenModal) {
    tokenModal.style.display = 'none';
  }
  if (event.target === walletModal) {
    walletModal.style.display = 'none';
  }
});

// Socket initialization
let socket;
const API_URL = window.location.origin; // Use same origin for API calls

// Connect to socket.io server
function connectSocket() {
  updateConnectionStatus('connecting');
  
  socket = io();
  
  // Connection opened
  socket.on('connect', () => {
    console.log('Connected to WebSocket server');
    updateConnectionStatus('connected');
  });
  
  // Connection closed
  socket.on('disconnect', () => {
    console.log('Disconnected from WebSocket server');
    updateConnectionStatus('offline');
    updateMonitoringStatus(false);
  });
  
  // Handle monitoring status updates
  socket.on('monitoringStarted', (data) => {
    if (data.success) {
      updateMonitoringStatus(true);
    }
  });
  
  socket.on('monitoringStopped', (data) => {
    updateMonitoringStatus(false);
  });
  
  // Handle new token event
  socket.on('newToken', (tokenData) => {
    console.log('New token detected:', tokenData);
    showNotification('New Token Detected!', `${tokenData.tokenName} (${tokenData.tokenSymbol}) was just detected on Solana.`);
    fetchLatestTokens();
  });
}

// Update connection status UI
function updateConnectionStatus(status) {
  connectionStatus.className = `status ${status}`;
  const statusText = connectionStatus.querySelector('.status-text');
  
  switch (status) {
    case 'connected':
      statusText.textContent = 'Connected';
      break;
    case 'connecting':
      statusText.textContent = 'Connecting...';
      break;
    case 'offline':
      statusText.textContent = 'Disconnected';
      stopMonitoringBtn.disabled = true;
      startMonitoringBtn.disabled = false;
      break;
  }
}

// Update monitoring status UI
function updateMonitoringStatus(isActive) {
  const statusText = monitoringStatus.querySelector('.status-text');
  
  if (isActive) {
    statusText.textContent = 'Monitoring: Active';
    startMonitoringBtn.disabled = true;
    stopMonitoringBtn.disabled = false;
  } else {
    statusText.textContent = 'Monitoring: Inactive';
    startMonitoringBtn.disabled = false;
    stopMonitoringBtn.disabled = true;
  }
}

// Fetch the latest tokens from API
async function fetchLatestTokens() {
  try {
    tokenList.innerHTML = '<div class="loading">Loading latest tokens...</div>';
    
    const response = await fetch(`${API_URL}/api/tokens/latest`);
    const data = await response.json();
    
    updateLastUpdated();
    displayTokens(data.tokens);
  } catch (error) {
    console.error('Error fetching latest tokens:', error);
    tokenList.innerHTML = '<div class="loading">Error loading tokens. Please try again.</div>';
  }
}

// Display tokens in the UI
function displayTokens(tokens) {
  if (!tokens || tokens.length === 0) {
    tokenList.innerHTML = '<div class="loading">No tokens found. Start monitoring to detect new tokens.</div>';
    return;
  }
  
  tokenList.innerHTML = '';
  
  tokens.forEach(token => {
    const card = createTokenCard(token);
    tokenList.appendChild(card);
  });
}

// Create a token card element
function createTokenCard(token) {
  const card = document.createElement('div');
  card.className = 'token-card';
  card.dataset.address = token.tokenAddress;
  
  // Determine risk level class based on token score
  let riskLevelClass = '';
  let riskStatus = '';
  
  if (token.tokenScore !== null) {
    if (token.tokenScore >= 75) {
      riskLevelClass = 'low-risk';
      riskStatus = 'Safe';
    } else if (token.tokenScore >= 50) {
      riskLevelClass = 'medium-risk';
      riskStatus = 'Medium Risk';
    } else {
      riskLevelClass = 'high-risk';
      riskStatus = 'High Risk';
    }
  }
  
  card.innerHTML = `
    <div class="token-header">
      <div class="token-image">
        ${token.tokenImageUrl ? `<img src="${token.tokenImageUrl}" alt="${token.tokenName}">` : '<i class="fas fa-coins"></i>'}
      </div>
      <div>
        <div class="token-name">${token.tokenName}</div>
        <div class="token-symbol">${token.tokenSymbol}</div>
      </div>
    </div>
    
    <div class="token-info">
      <div class="info-item">
        <span class="info-label">Price</span>
        <span class="info-value">${token.price}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Market Cap</span>
        <span class="info-value">${token.marketCap}</span>
      </div>
      <div class="info-item">
        <span class="info-label">24h Volume</span>
        <span class="info-value">${token.volume24h}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Created</span>
        <span class="info-value">${formatDate(token.timestamp)}</span>
      </div>
    </div>
    
    ${token.tokenScore !== null ? `
    <div class="token-safety">
      <div class="safety-score ${riskLevelClass}">
        <span class="safety-label">Safety Score:</span>
        <div class="progress-container">
          <div class="progress-bar" style="width: ${token.tokenScore}%"></div>
        </div>
        <span class="progress-value">${token.tokenScore}%</span>
      </div>
      <div class="safety-status">${riskStatus}</div>
    </div>
    ` : ''}
    
    <div class="token-links">
      <button id="explorer-${token.tokenAddress}" class="token-btn">
        <i class="fas fa-external-link-alt"></i>Explorer
      </button>
      <button id="birdeye-${token.tokenAddress}" class="token-btn">
        <i class="fas fa-chart-line"></i>BirdEye
      </button>
      <button id="dexscreener-${token.tokenAddress}" class="token-btn">
        <i class="fas fa-chart-area"></i>DexScreener
      </button>
      <button id="trade-${token.tokenAddress}" class="token-btn">
        <i class="fas fa-exchange-alt"></i>Trade
      </button>
    </div>
  `;
  
  // Add event listeners for the buttons
  const explorerBtn = card.querySelector(`#explorer-${token.tokenAddress}`);
  const birdeyeBtn = card.querySelector(`#birdeye-${token.tokenAddress}`);
  const dexscreenerBtn = card.querySelector(`#dexscreener-${token.tokenAddress}`);
  const tradeBtn = card.querySelector(`#trade-${token.tokenAddress}`);

  explorerBtn.addEventListener('click', () => window.open(token.explorerUrl, '_blank'));
  birdeyeBtn.addEventListener('click', () => window.open(token.birdseyeUrl, '_blank'));
  dexscreenerBtn.addEventListener('click', () => window.open(`https://dexscreener.com/solana/${token.tokenAddress}`, '_blank'));
  tradeBtn.addEventListener('click', () => window.open(`https://jup.ag/swap/${token.tokenAddress}-SOL`, '_blank'));
  
  // Add event listener to view details button
  const viewDetailsBtn = card.querySelector('.view-details');
  viewDetailsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openTokenDetails(token.tokenAddress);
  });
  
  return card;
}

// Format date to be more readable
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

// Update the last updated timestamp
function updateLastUpdated() {
  const now = new Date();
  lastUpdated.textContent = `Last updated: ${now.toLocaleString()}`;
}

// Open token details modal
async function openTokenDetails(tokenAddress) {
  try {
    const tokenDetailsEl = document.getElementById('tokenDetails');
    tokenDetailsEl.innerHTML = '<div class="loading">Loading token details...</div>';
    tokenModal.style.display = 'block';
    
    const response = await fetch(`${API_URL}/api/token/${tokenAddress}`);
    const tokenData = await response.json();
    
    displayTokenDetails(tokenData);
  } catch (error) {
    console.error('Error fetching token details:', error);
    document.getElementById('tokenDetails').innerHTML = '<div class="loading">Error loading token details.</div>';
  }
}

// Display token details in the modal
function displayTokenDetails(token) {
  const tokenDetailsEl = document.getElementById('tokenDetails');
  
  // Determine risk level class based on token score
  let riskLevelClass = '';
  let riskStatus = '';
  
  if (token.score !== null) {
    if (token.score >= 75) {
      riskLevelClass = 'low-risk';
      riskStatus = 'Safe';
    } else if (token.score >= 50) {
      riskLevelClass = 'medium-risk';
      riskStatus = 'Medium Risk';
    } else {
      riskLevelClass = 'high-risk';
      riskStatus = 'High Risk';
    }
  }
  
  tokenDetailsEl.innerHTML = `
    <div class="token-detail-header">
      <div class="detail-image">
        ${token.image ? `<img src="${token.image}" alt="${token.name}">` : '<i class="fas fa-coins"></i>'}
      </div>
      <div class="detail-title">
        <h3>${token.name || 'Unknown Token'}</h3>
        <p>${token.symbol || 'UNKNOWN'}</p>
      </div>
    </div>
    
    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-label">Token Address</div>
        <div class="detail-value">${token.address}</div>
      </div>
      
      <div class="detail-item">
        <div class="detail-label">Price</div>
        <div class="detail-value">$${token.price !== null ? token.price : 'N/A'}</div>
      </div>
      
      <div class="detail-item">
        <div class="detail-label">Market Cap</div>
        <div class="detail-value">$${token.marketCap !== null ? token.marketCap.toLocaleString() : 'N/A'}</div>
      </div>
      
      <div class="detail-item">
        <div class="detail-label">24h Volume</div>
        <div class="detail-value">$${token.volume24h !== null ? token.volume24h.toLocaleString() : 'N/A'}</div>
      </div>
      
      ${token.score !== null ? `
      <div class="detail-item ${riskLevelClass}">
        <div class="detail-label">Safety Score</div>
        <div class="detail-value">${token.score}% - ${riskStatus}</div>
        <div class="progress-container">
          <div class="progress-bar" style="width: ${token.score}%"></div>
        </div>
      </div>
      ` : ''}
      
      ${token.twitter ? `
      <div class="detail-item">
        <div class="detail-label">Twitter</div>
        <div class="detail-value"><a href="https://twitter.com/${token.twitter}" target="_blank">${token.twitter}</a></div>
      </div>
      ` : ''}
      
      ${token.telegram ? `
      <div class="detail-item">
        <div class="detail-label">Telegram</div>
        <div class="detail-value"><a href="${token.telegram}" target="_blank">${token.telegram}</a></div>
      </div>
      ` : ''}
    </div>
    
    <div class="detail-links">
      <a href="https://explorer.solana.com/address/${token.address}?cluster=mainnet-beta" class="token-link" target="_blank">
        <i class="fas fa-external-link-alt"></i> Solana Explorer
      </a>
      <a href="https://birdeye.so/token/${token.address}?chain=solana" class="token-link" target="_blank">
        <i class="fas fa-chart-line"></i> BirdEye
      </a>
      <a href="https://dexscreener.com/solana/${token.address}" class="token-link" target="_blank">
        <i class="fas fa-chart-area"></i> DexScreener
      </a>
      <a href="https://www.dextools.io/app/en/solana/pair-explorer/${token.address}" class="token-link" target="_blank">
        <i class="fas fa-tools"></i> Dextools
      </a>
      <a href="https://jup.ag/swap/${token.address}-SOL" class="token-link" target="_blank">
        <i class="fas fa-exchange-alt"></i> Jupiter (Swap)
      </a>
      <a href="https://raydium.io/swap/?inputCurrency=${token.address}&outputCurrency=SOL" class="token-link" target="_blank">
        <i class="fas fa-radiation"></i> Raydium (Swap)
      </a>
    </div>
  `;
}

// Create wallet functionality
async function createNewWallet() {
  const pin = pinInput.value;
  const confirmPin = pinConfirm.value;
  
  // Validate PIN
  if (pin.length < 6) {
    showWalletResult('PIN must be at least 6 characters long', 'error');
    return;
  }
  
  if (pin !== confirmPin) {
    showWalletResult('PINs do not match', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pin })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showWalletResult(`Wallet created successfully! Public Key: ${data.publicKey}`, 'success');
      pinInput.value = '';
      pinConfirm.value = '';
    } else {
      showWalletResult(`Error: ${data.error}`, 'error');
    }
  } catch (error) {
    console.error('Error creating wallet:', error);
    showWalletResult('Failed to create wallet', 'error');
  }
}

// Display wallet creation result
function showWalletResult(message, type) {
  walletResult.textContent = message;
  walletResult.className = `result-message ${type}`;
}

// Show notification
function showNotification(title, message) {
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body: message });
        }
      });
    }
  }
}

// Event listeners
startMonitoringBtn.addEventListener('click', () => {
  if (socket && socket.connected) {
    socket.emit('startMonitoring');
  } else {
    connectSocket();
    setTimeout(() => {
      if (socket && socket.connected) {
        socket.emit('startMonitoring');
      }
    }, 1000);
  }
});

stopMonitoringBtn.addEventListener('click', () => {
  if (socket && socket.connected) {
    socket.emit('stopMonitoring');
  }
});

createWalletBtn.addEventListener('click', () => {
  walletModal.style.display = 'block';
});

submitWalletCreateBtn.addEventListener('click', createNewWallet);

refreshTokensBtn.addEventListener('click', fetchLatestTokens);

// Initialize app
function init() {
  connectSocket();
  fetchLatestTokens();
  
  // Request notification permissions
  if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init); 