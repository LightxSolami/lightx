# Additional Token Sources for LightX

This document explains how to implement monitoring for additional token sources in the LightX application. The implementation includes frontend and backend changes to support Raydium and Jupiter token sources.

## Overview of Changes

1. **Frontend changes:**
   - Added UI for selecting token sources to monitor
   - Modified CSS to style the source selection and source badges
   - Updated JavaScript to send selected sources to the server
   - Added visual indicators for token sources in the UI

2. **Backend changes:**
   - Created implementation for monitoring Raydium tokens
   - Created implementation for monitoring Jupiter tokens
   - Updated socket.io handlers to respect source selection
   - Enhanced token data to include source information

## How to Implement

### Backend Integration

1. Copy the functions from `src/token-monitoring-extensions.ts` into your main `src/index.ts` file:
   - `monitorRaydiumTokens`
   - `monitorJupiterTokens`
   - Update your `sendTokenInfo` function to include source information

2. Update your Socket.io connection handler in `src/index.ts` to use the selected sources:

```typescript
// Socket.io connection handling
io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Handle start monitoring request
  socket.on('startMonitoring', (data?: {clientId?: string, address?: string, sources?: any}) => {
    const clientId = socket.id;
    
    // Get selected sources or use defaults
    const selectedSources = data?.sources || {
      rayFee: true,
      pumpFun: true,
      moonshot: true,
      raydium: true, 
      jupiter: true
    };
    
    console.log(`Starting monitoring for client: ${clientId} with sources:`, selectedSources);
    
    // Start all selected monitoring services
    if (selectedSources.rayFee) {
      monitorNewTokens(solanaConnection, clientId);
    }
    
    if (selectedSources.pumpFun) {
      monitorPumpFunTokens(solanaConnection, clientId);
    }
    
    if (selectedSources.moonshot) {
      monitorMoonshotTokens(solanaConnection, clientId);
    }
    
    if (selectedSources.raydium) {
      monitorRaydiumTokens(solanaConnection, clientId);
    }
    
    if (selectedSources.jupiter) {
      monitorJupiterTokens(solanaConnection, clientId);
    }
    
    // Confirm to the client
    socket.emit('monitoringStarted', { success: true });
  });
});
```

3. Update the `clientToMonitoringMap` to include the new sources:
```typescript
const clientToMonitoringMap = new Map<string, { 
  newTokens: boolean, 
  pumpFun: boolean, 
  moonshot: boolean,
  raydium: boolean,
  jupiter: boolean 
}>();
```

4. Update the `sendTokenInfo` function to include the source information:
```typescript
async function sendTokenInfo(socketId: string, message: string, tokenAddress: string, source: string = 'Unknown') {
  try {
    // ... existing code ...
    
    const tokenData = {
      tokenAddress: tokenAddress,
      tokenName: tokenMetadata.name || 'Unknown Token',
      tokenSymbol: tokenMetadata.symbol || 'UNKNOWN',
      tokenImageUrl: tokenMetadata.image,
      marketCap: birdeyeData.marketCap,
      tokenScore: tokenScore || 0,
      source: source, // Added source information
      timestamp: new Date().toISOString()
    };
    
    // ... rest of function ...
  } catch (error) {
    console.error(`Error in sendTokenInfo: ${error}`);
  }
}
```

## How It Works

The implementation monitors program IDs associated with Raydium and Jupiter to detect new token activity. When a relevant transaction is detected, the code extracts the token address and sends it to the client with source information.

Each token source has its own monitoring function that runs independently. When a user selects specific sources, only those monitors will be activated, reducing server load and focusing on the sources the user cares about.

## Additional Customization

You can add more token sources by following the same pattern:

1. Define the program ID for the new source
2. Create a monitoring function similar to the examples
3. Update the UI to include a checkbox for the new source
4. Add CSS for the new source badge
5. Update the socket handler to start the new monitor when selected

## Token Source Identification Criteria

Each token source uses different criteria to identify new tokens:

- **RayFee**: Monitors transactions that pay fees to the RayFee program
- **PumpFun**: Monitors the PumpFun program for new token creation
- **Moonshot**: Monitors the Moonshot program for new token listings
- **Raydium**: Monitors for new pools and swaps on Raydium
- **Jupiter**: Monitors for first swaps of new tokens on Jupiter

## Testing

To test the implementation, start monitoring with different source combinations selected and verify that:

1. Only the selected sources are being monitored
2. Tokens from different sources display with the correct source badge
3. The monitoring can be stopped and restarted with different selections 