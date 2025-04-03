# TrakorAi - Solana Token Monitor

TrakorAi is a web-based application for monitoring new Solana tokens in real-time. It detects token creation events on the Solana blockchain and provides comprehensive information about each token, including safety scores, price data, and market statistics.

## Features

- **Real-time Token Detection**: Monitor the Solana blockchain for new token creations
- **Token Safety Analysis**: Get safety scores for tokens based on liquidity, holders, volume, and more
- **Market Data**: View price, market cap, and volume information for detected tokens
- **Wallet Creation**: Create and manage Solana wallets securely with PIN protection
- **Beautiful UI**: Modern and responsive interface for desktop and mobile devices

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/TrakorAi.git
   cd TrakorAi
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the root directory and add the following:
   ```
   RPC_ENDPOINT=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
   RPC_WEBSOCKET_ENDPOINT=wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
   PORT=3000
   ```

4. Start the application:
   ```
   npm start
   ```

5. Open your browser and navigate to `http://localhost:3000`

## Usage

### Monitoring Tokens

1. Click the "Start Monitoring" button on the dashboard to begin monitoring the Solana blockchain for new tokens.
2. When new tokens are detected, they will appear in the "Latest Tokens" section.
3. Click "Stop Monitoring" to pause the monitoring process.

### Creating a Wallet

1. Click the "Create Wallet" button to open the wallet creation form.
2. Enter a PIN (minimum 6 characters) and confirm it.
3. Click "Create Wallet" to generate a new Solana wallet.
4. Your wallet's public key will be displayed. Make sure to save your PIN securely.

### Viewing Token Details

1. Click "Details" on any token card to view comprehensive information about the token.
2. The token detail page includes:
   - Token name, symbol, and address
   - Price, market cap, and volume data
   - Safety score with visual indicator
   - Social media links (if available)
   - Links to external tools (Explorer, BirdEye, DexScreener, etc.)

## Technical Details

### Architecture

TrakorAi uses a modern web stack:

- **Backend**:
  - Node.js with Express for the API server
  - Socket.IO for real-time communication
  - Solana Web3.js for blockchain interaction

- **Frontend**:
  - Vanilla JavaScript for client-side logic
  - HTML5 and CSS3 for a responsive UI
  - Socket.IO client for real-time updates

### Security

- Private keys are encrypted using AES-256-CBC with a user-provided PIN
- All sensitive operations are performed on the server side
- No blockchain transactions can be made without proper authentication

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Solana](https://solana.com/) for the blockchain infrastructure
- [BirdEye](https://birdeye.so/) for token price data
- [DexScreener](https://dexscreener.com/) for market data
- [RugCheck](https://rugcheck.xyz/) for token safety analysis
