# LightX - Solana Token Monitor

LightX is a web-based application for monitoring new Solana tokens in real-time. It detects token creation events on the Solana blockchain and provides comprehensive information about each token, including safety scores, price data, and market statistics.

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
   git clone https://github.com/LightxSolami/lightx.git
   cd Lightx
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

LightX uses a modern web stack:

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

# LightX Launchpad Coming soon !!

A modern token launch platform for Solana that implements bonding curves and King of the Hill mechanics.

## Features

- **Bonding Curves**: Dynamic token pricing based on supply and demand
  - Linear bonding curve: Price increases linearly with each token minted
  - Exponential bonding curve: Price increases exponentially with each token minted

- **King of the Hill**: First contributor to reach 50 SOL becomes the King of the Hill
  - Special rewards and privileges for the King of the Hill
  - Automatic Raydium listing when threshold is reached

- **Raydium Integration**: Automatic listing on Raydium DEX
  - Liquidity pool creation
  - Market setup
  - Initial liquidity provision

- **Real-time Updates**: Live tracking of launchpad status
  - Total raised
  - Current price
  - Tokens minted
  - King of the Hill status

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Solana CLI tools
- Phantom or other Solana wallet

### Installation

1. Clone the repository:
```bash
git clone https://github.com/LightxSolami/lightx.git
cd Lightx
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Start the server:
```bash
npm start
```

### Development

Run the development server with hot reload:
```bash
npm run dev
```

## Usage

### Creating a Launchpad

1. Navigate to the launchpad page
2. Click "Create New Launchpad"
3. Fill in the required information:
   - Token Name
   - Token Symbol
   - Description
   - Initial Supply
   - Bonding Curve Type
   - Social Links (optional)

### Contributing to a Launchpad

1. Select a launchpad from the list
2. Click "Contribute"
3. Enter your contribution amount in SOL
4. Connect your wallet
5. Confirm the transaction

### King of the Hill

- The first contributor to reach 50 SOL becomes the King of the Hill
- The King of the Hill receives special rewards and privileges
- The token is automatically listed on Raydium when the threshold is reached

## API Endpoints

### Launchpad Management

- `GET /api/launchpads` - Get all launchpads
- `POST /api/launchpad/create` - Create a new launchpad
- `GET /api/launchpad/:id` - Get launchpad details
- `POST /api/launchpad/:id/contribute` - Contribute to a launchpad
- `GET /api/launchpad/:id/stats` - Get launchpad statistics
- `GET /api/launchpad/:id/king-of-hill` - Get King of the Hill status
- `GET /api/launchpad/:id/bonding-curve` - Get bonding curve information

## WebSocket Events

- `launchpadUpdate` - Real-time updates for launchpad status
- `launchpadCreated` - Notification when a new launchpad is created

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Server is running on port 3000
Visit http://localhost:3000 to access the application
