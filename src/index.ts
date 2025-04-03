import { rayFee, solanaConnection } from './config';
import { storeData } from './utils';
import { getSwapQuote, getSwapTransaction, calculateExpectedAmount } from './jupiter';
import fs from 'fs';
import chalk from 'chalk';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { Metaplex } from '@metaplex-foundation/js';
import express, { Request, Response, RequestHandler } from 'express';
import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Server as SocketIOServer } from 'socket.io';
import { Socket } from 'socket.io';

// Create Express app and socket.io server
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Set the port
const PORT = process.env.PORT || 3000;

// Track active monitoring clients
const activeMonitoringSessions = new Set<string>();
const processedTransactions = new Set<string>();
const clientToMonitoringMap = new Map<string, { newTokens: boolean, pumpFun: boolean, moonshot: boolean }>();

// File paths
const dataPath = path.join(__dirname, 'data', 'new_solana_tokens.json');

// API URLs
const RUGCHECK_API_URL = 'https://api.rugcheck.xyz/v1';
const DEXSCREENER_API_URL = 'https://api.dexscreener.com/latest/dex/tokens';
const BIRDEYE_API_URL = 'https://birdeye.so/api/v1/token';

// Fetch token metadata using Metaplex
async function fetchTokenMetadata(tokenAddress: string): Promise<{ name: string | null; symbol: string | null; image: string | null }> {
  try {
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const metaplex = Metaplex.make(connection);

    const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(tokenAddress) });

    return {
      name: nft.json?.name || null,
      symbol: nft.json?.symbol || null,
      image: nft.json?.image || null,
    };
  } catch (error) {
    console.error(chalk.red('Error fetching token metadata:', error));
    return { name: null, symbol: null, image: null };
  }
}

// Fetch RugCheck score
async function fetchRugcheckScore(tokenAddress: string): Promise<number> {
  try {
    const response = await axios.get(`${RUGCHECK_API_URL}/tokens/${tokenAddress}/report/summary`);
    const riskScores = response.data.risks.map((risk: any) => risk.score);
    const totalRisk = riskScores.reduce((acc: number, score: number) => acc + score, 0);
    return Math.max(0, 100 - (totalRisk / 100));
  } catch (error) {
    console.error(chalk.red('Error fetching RugCheck score:', error));
    return 0;
  }
}

// Fetch DexScreener data
async function fetchDexscreenerData(tokenAddress: string): Promise<{
  marketCap: number | null;
  volume24h: number | null;
  twitter?: string | null;
  telegram?: string | null;
}> {
  try {
    const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    console.log('DexScreener API Response:', response.data);

    // Handle case where pairs is null
    if (!response.data.pairs || response.data.pairs.length === 0) {
      console.error(chalk.yellow(`No trading pairs found for token: ${tokenAddress}`));
      return { marketCap: null, volume24h: null, twitter: null, telegram: null };
    }

    const pairData = response.data.pairs[0];
    if (!pairData) {
      console.error(chalk.yellow(`No trading pairs found for token: ${tokenAddress}`));
      return { marketCap: null, volume24h: null, twitter: null, telegram: null };
    }

    // Log the pair data to see what we're getting
    console.log('DexScreener pair data:', {
      mc: pairData.mc,
      fdv: pairData.fdv,
      volume: pairData.volume,
      liquidity: pairData.liquidity
    });

    // Extract social links from pairData
    const twitter = pairData.info?.twitter || null;
    const telegram = pairData.info?.telegram || null;

    return {
      marketCap: pairData.mc || pairData.fdv || null, // Try both mc and fdv
      volume24h: pairData.volume?.h24 || null,
      twitter,
      telegram,
    };
  } catch (error) {
    console.error(chalk.red('Error fetching DexScreener data:', error));
    return { marketCap: null, volume24h: null, twitter: null, telegram: null };
  }
}

// Fetch Birdeye data
async function fetchBirdeyeData(tokenAddress: string): Promise<{ 
  price: number | null; 
  marketCap: number | null; 
  volume24h: number | null;
  twitter?: string | null;
  telegram?: string | null;
}> {
  const maxRetries = 3; // Maximum number of retries
  const delay = 2000; // Delay between retries in milliseconds

  const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || '09db088f85154d22af2b50ed422433f5';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Fetch price from Birdeye
      const birdeyeResponse = await axios.get(`https://public-api.birdeye.so/defi/price?address=${tokenAddress}`, {
        headers: {
          'accept': 'application/json',
          'x-chain': 'solana',
          'X-API-KEY': BIRDEYE_API_KEY,
        },
      });

      // Handle case where data is not available
      if (!birdeyeResponse.data.data?.value) {
        console.error(chalk.yellow(`No price data found for token: ${tokenAddress}`));
        // Fallback to DexScreener if Birdeye fails
        const dexscreenerData = await fetchDexscreenerData(tokenAddress);
        return {
          price: dexscreenerData.marketCap ? dexscreenerData.marketCap / 1e6 : null, // Example fallback logic
          marketCap: dexscreenerData.marketCap,
          volume24h: dexscreenerData.volume24h,
          twitter: dexscreenerData.twitter,
          telegram: dexscreenerData.telegram,
        };
      }

      const price = birdeyeResponse.data.data.value;

      // Fetch market cap and volume from DexScreener
      const dexscreenerData = await fetchDexscreenerData(tokenAddress);

      return {
        price,
        marketCap: dexscreenerData.marketCap,
        volume24h: dexscreenerData.volume24h,
        twitter: dexscreenerData.twitter,
        telegram: dexscreenerData.telegram,
      };
    } catch (error: any) {
      if (error.response && error.response.status === 429) {
        console.log(chalk.yellow(`Rate limit exceeded. Retrying in ${delay / 1000} seconds... (Attempt ${attempt}/${maxRetries})`));
        await new Promise((resolve) => setTimeout(resolve, delay)); // Add delay before retrying
      } else {
        console.error(chalk.red('Error fetching Birdeye data:', error));
        // Fallback to DexScreener if Birdeye fails
        const dexscreenerData = await fetchDexscreenerData(tokenAddress);
        return {
          price: dexscreenerData.marketCap ? dexscreenerData.marketCap / 1e6 : null, // Example fallback logic
          marketCap: dexscreenerData.marketCap,
          volume24h: dexscreenerData.volume24h,
          twitter: dexscreenerData.twitter,
          telegram: dexscreenerData.telegram,
        };
      }
    }
  }

  console.error(chalk.red('Max retries reached. Unable to fetch Birdeye data.'));
  // Fallback to DexScreener if all retries fail
  const dexscreenerData = await fetchDexscreenerData(tokenAddress);
  return {
    price: dexscreenerData.marketCap ? dexscreenerData.marketCap / 1e6 : null, // Example fallback logic
    marketCap: dexscreenerData.marketCap,
    volume24h: dexscreenerData.volume24h,
    twitter: dexscreenerData.twitter,
    telegram: dexscreenerData.telegram,
  };
}

// Helper function to create a text-based progress bar
function createTextProgressBar(score: number): string {
  const barLength = 10; // Length of the progress bar
  const filledBlocks = Math.round((score / 100) * barLength);
  const emptyBlocks = barLength - filledBlocks;
  return `[${'='.repeat(filledBlocks)}${' '.repeat(emptyBlocks)}]`;
}

// Calculate liquidity score
function calculateLiquidityScore(dexscreenerData: any): number {
  const liquidity = dexscreenerData.pairs?.[0]?.liquidity?.usd || 0;
  return Math.min(100, (liquidity / 1000000) * 100); // Normalize liquidity score
}

// Calculate holder score
function calculateHolderScore(birdeyeData: any): number {
  const holders = birdeyeData.holders || 0;
  return Math.min(100, (holders / 1000) * 100); // Normalize holder score
}

// Calculate volume score
function calculateVolumeScore(dexscreenerData: any): number {
  const volume = dexscreenerData.pairs?.[0]?.volume?.h24 || 0;
  return Math.min(100, (volume / 1000000) * 100); // Normalize volume score
}

// Fetch comprehensive token score
async function fetchTokenScore(tokenAddress: string): Promise<number | null> {
  try {
    const [rugcheckScore, dexscreenerData, birdeyeData] = await Promise.all([
      fetchRugcheckScore(tokenAddress),
      fetchDexscreenerData(tokenAddress),
      fetchBirdeyeData(tokenAddress),
    ]);

    const liquidityScore = calculateLiquidityScore(dexscreenerData);
    const holderScore = calculateHolderScore(birdeyeData);
    const volumeScore = calculateVolumeScore(dexscreenerData);

    const totalScore = (rugcheckScore * 0.4) + (liquidityScore * 0.3) + (holderScore * 0.2) + (volumeScore * 0.1);
    return Math.min(100, Math.max(0, totalScore));
  } catch (error) {
    console.error(chalk.red('Error fetching token score:', error));
    return null;
  }
}

// Utility function to clear old processed transactions to prevent memory leaks
function clearOldProcessedTransactions() {
  console.log(`Clearing old processed transactions. Current count: ${processedTransactions.size}`);
  processedTransactions.clear();
  console.log('Processed transactions cleared');
}

// Set up a periodic cleanup of processed transactions (every 30 minutes)
setInterval(clearOldProcessedTransactions, 30 * 60 * 1000);

// Monitor new Solana tokens
async function monitorNewTokens(connection: Connection, socketId: string) {
  try {
    console.log(chalk.green(`Monitoring new Solana tokens for client ${socketId}...`));

    // Add the socketId to active monitoring sessions and track the type
    activeMonitoringSessions.add(socketId);
    
    // Track this monitoring session type
    if (!clientToMonitoringMap.has(socketId)) {
      clientToMonitoringMap.set(socketId, { newTokens: true, pumpFun: false, moonshot: false });
    } else {
      clientToMonitoringMap.get(socketId)!.newTokens = true;
    }
    
    // Log active sessions for debugging
    console.log(`Active monitoring sessions: ${Array.from(activeMonitoringSessions)}`);
    
    // Ensure this client gets immediately notified of recent tokens
    sendRecentTokens(socketId);

    connection.onLogs(
      rayFee,
      async ({ logs, err, signature }) => {
        try {
          // Check if the socketId is still active
          if (!activeMonitoringSessions.has(socketId)) {
            console.log(chalk.yellow(`Monitoring stopped for client ${socketId}.`));
            return;
          }

          if (err) {
            console.error(`Connection error: ${err}`);
            return;
          }

          // Skip if we've already processed this transaction
          if (processedTransactions.has(signature)) {
            return;
          }
          processedTransactions.add(signature);

          console.log(chalk.bgGreen(`Found new token signature: ${signature}`));

          let signer = '';
          let baseAddress = '';

          const parsedTransaction = await connection.getParsedTransaction(
            signature,
            {
              maxSupportedTransactionVersion: 0,
              commitment: 'confirmed',
            }
          );

          if (parsedTransaction && parsedTransaction.meta !== null && parsedTransaction.meta.err == null) {
            console.log(`Successfully parsed transaction`);

            signer = parsedTransaction.transaction.message.accountKeys[0].pubkey.toString();

            console.log(`Creator: ${signer}`);

            const postTokenBalances = parsedTransaction.meta.postTokenBalances;

            const baseInfo = postTokenBalances?.find(
              (balance) =>
                balance.owner === '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1' &&
                balance.mint !== 'So11111111111111111111111111111111111111112'
            );

            if (baseInfo) {
              baseAddress = baseInfo.mint;
            }
          }

          const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`;
          const message = `New Token Detected!`;

          await sendTokenInfo('all', message, baseAddress);
        } catch (error) {
          const errorMessage = `Error occurred in new Solana token log callback function: ${error}`;
          console.log(chalk.red(errorMessage));
          fs.appendFile('errorNewTokensLogs.txt', `${errorMessage}\n`, function (err) {
            if (err) console.log('Error writing error logs', err);
          });
        }
      },
      'confirmed'
    );
  } catch (error) {
    const errorMessage = `Error occurred in new Solana LP monitor: ${error}`;
    console.log(chalk.red(errorMessage));
    fs.appendFile('errorNewTokensLogs.txt', `${errorMessage}\n`, function (err) {
      if (err) console.log('Error writing error logs', err);
    });
  }
}

// Function to send recent tokens to a client who just started monitoring
async function sendRecentTokens(socketId: string) {
  try {
    console.log(`Sending recent tokens to client ${socketId}`);
    
    // Read the token data file
    if (!fs.existsSync(dataPath)) {
      console.log('No token data file exists yet.');
      return;
    }
    
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const tokens = JSON.parse(rawData);
    
    // Send the 5 most recent tokens
    const recentTokens = tokens.slice(-5).reverse();
    
    if (recentTokens.length === 0) {
      console.log('No recent tokens to send');
      return;
    }
    
    console.log(`Sending ${recentTokens.length} recent tokens to client ${socketId}`);
    
    // Send each token to the client
    for (const token of recentTokens) {
      // Added delay to prevent overwhelming the client
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Skip tokens that don't have an address
      if (!token.tokenAddress) {
        console.log('Skipping token with no address');
        continue;
      }
      
      // Update the message to indicate this is a recent token
      const tokenWithHistory = {
        ...token,
        message: 'Recent Token (History)',
      };
      
      io.to(socketId).emit('newToken', tokenWithHistory);
    }
    
    console.log(`Sent ${recentTokens.length} recent tokens to client ${socketId}`);
  } catch (error) {
    console.error('Error sending recent tokens:', error);
  }
}

// Monitor PumpFun tokens
async function monitorPumpFunTokens(connection: Connection, socketId: string) {
  try {
    console.log(chalk.green(`Monitoring PumpFun tokens for client ${socketId}...`));
    activeMonitoringSessions.add(socketId);
    
    // Track this monitoring session type
    if (!clientToMonitoringMap.has(socketId)) {
      clientToMonitoringMap.set(socketId, { newTokens: false, pumpFun: true, moonshot: false });
    } else {
      clientToMonitoringMap.get(socketId)!.pumpFun = true;
    }

    // PumpFun program ID
    const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

    // Create a new connection with optimized settings
    const createConnection = () => {
      return new Connection('https://api.mainnet-beta.solana.com', {
        commitment: 'confirmed',
        wsEndpoint: 'wss://api.mainnet-beta.solana.com',
        confirmTransactionInitialTimeout: 60000,
        httpHeaders: {
          'Cache-Control': 'no-cache',
        }
      });
    };

    let currentConnection = connection;
    let subscriptionId: number | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;

    const isConnectionError = (err: any): boolean => {
      // Check if it's an instruction error (these are normal and should be ignored)
      if (err && typeof err === 'object' && 'InstructionError' in err) {
        return false;
      }
      // Check if it's a WebSocket connection error
      if (err && typeof err === 'object' && 'message' in err && 
          (err.message.includes('WebSocket') || err.message.includes('connection'))) {
        return true;
      }
      return false;
    };

    const setupSubscription = async () => {
      try {
        if (subscriptionId !== null) {
          await currentConnection.removeOnLogsListener(subscriptionId);
        }

        subscriptionId = currentConnection.onLogs(
          new PublicKey(PUMPFUN_PROGRAM_ID),
          async ({ logs, err, signature }) => {
            try {
              if (!activeMonitoringSessions.has(socketId)) {
                console.log(chalk.yellow(`PumpFun monitoring stopped for client ${socketId}.`));
                return;
              }

              if (err) {
                // Only log and attempt reconnection for actual connection errors
                if (isConnectionError(err)) {
                  console.error(chalk.red(`PumpFun connection error: ${JSON.stringify(err)}`));
                  await reconnect();
                }
                return;
              }

              // Check for different types of events
              const isNewToken = logs.some(log => 
                log.includes('Program log: create') && 
                log.includes('pump') &&
                !log.includes('error')
              );

              const isKingOfHill = logs.some(log => 
                log.includes('Program log: King of the Hill') &&
                !log.includes('error')
              );

              if (!isNewToken && !isKingOfHill) {
                return;
              }

              if (processedTransactions.has(signature)) {
                return;
              }
              processedTransactions.add(signature);

              // Parse the transaction to get token details
              const parsedTransaction = await currentConnection.getParsedTransaction(
                signature,
                {
                  maxSupportedTransactionVersion: 0,
                  commitment: 'confirmed',
                }
              );

              if (parsedTransaction && parsedTransaction.meta !== null && parsedTransaction.meta.err == null) {
                // Look for token accounts in the transaction
                const postTokenBalances = parsedTransaction.meta.postTokenBalances;
                const tokenInfo = postTokenBalances?.find(
                  (balance) => {
                    // Check if this is a token account owned by the PumpFun program
                    return balance.owner === PUMPFUN_PROGRAM_ID && 
                           balance.mint !== 'So11111111111111111111111111111111111111112' && // Exclude wrapped SOL
                           balance.uiTokenAmount?.uiAmount && balance.uiTokenAmount.uiAmount > 0; // Ensure token amount is greater than 0
                  }
                );

                if (tokenInfo) {
                  // Get additional token details
                  const tokenMetadata = await fetchTokenMetadata(tokenInfo.mint);
                  const birdeyeData = await fetchBirdeyeData(tokenInfo.mint);
                  
                  // Create enhanced token info
                  const enhancedTokenInfo = {
                    ...tokenInfo,
                    name: tokenMetadata.name || 'Unknown Token',
                    symbol: tokenMetadata.symbol || 'UNKNOWN',
                    image: tokenMetadata.image,
                    price: birdeyeData.price,
                    marketCap: birdeyeData.marketCap,
                    volume24h: birdeyeData.volume24h,
                    timestamp: new Date().toISOString(),
                    eventType: isKingOfHill ? 'King of the Hill' : 'New Token',
                    isKingOfHill: isKingOfHill
                  };

                  const message = isKingOfHill 
                    ? `🎯 King of the Hill Token Detected! ${tokenMetadata.symbol || 'Unknown Token'}`
                    : 'New PumpFun Token Detected!';

                  console.log(chalk.bgGreen(`${message}: ${tokenInfo.mint}`));
                  await sendTokenInfo('all', message, tokenInfo.mint);
                }
              }
            } catch (error) {
              // Only attempt reconnection for actual connection errors
              if (isConnectionError(error)) {
                console.error(chalk.red('Error in PumpFun token monitoring callback:', error));
                await reconnect();
              }
            }
          },
          'confirmed'
        );
      } catch (error) {
        if (isConnectionError(error)) {
          console.error(chalk.red('Error setting up PumpFun subscription:', error));
          await reconnect();
        }
      }
    };

    const reconnect = async () => {
      try {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error(chalk.red('Max reconnection attempts reached. Stopping PumpFun monitoring.'));
          return;
        }

        reconnectAttempts++;
        console.log(chalk.yellow(`Attempting to reconnect to PumpFun monitoring... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`));
        
        if (subscriptionId !== null) {
          await currentConnection.removeOnLogsListener(subscriptionId);
          subscriptionId = null;
        }
        
        currentConnection = createConnection();
        await setupSubscription();
        console.log(chalk.green('Successfully reconnected to PumpFun monitoring'));
        reconnectAttempts = 0; // Reset counter on successful reconnection
      } catch (error) {
        console.error(chalk.red('Error reconnecting to PumpFun monitoring:', error));
        // Retry reconnection after delay
        setTimeout(reconnect, 5000);
      }
    };

    // Initial setup
    await setupSubscription();

  } catch (error) {
    console.error(chalk.red('Error in PumpFun token monitor:', error));
  }
}

// Monitor Moonshot tokens
async function monitorMoonshotTokens(connection: Connection, socketId: string) {
  try {
    console.log(chalk.green(`Monitoring Moonshot tokens for client ${socketId}...`));
    activeMonitoringSessions.add(socketId);
    
    // Track this monitoring session type
    if (!clientToMonitoringMap.has(socketId)) {
      clientToMonitoringMap.set(socketId, { newTokens: false, pumpFun: false, moonshot: true });
    } else {
      clientToMonitoringMap.get(socketId)!.moonshot = true;
    }

    // Moonshot program ID
    const MOONSHOT_PROGRAM_ID = 'MSHoTqKhDD6GChuBix4gYv4XWXfWvxZqWxZqWxZqWxZ';

    // Create a new connection with optimized settings
    const createConnection = () => {
      return new Connection('https://api.mainnet-beta.solana.com', {
        commitment: 'confirmed',
        wsEndpoint: 'wss://api.mainnet-beta.solana.com',
        confirmTransactionInitialTimeout: 60000,
        httpHeaders: {
          'Cache-Control': 'no-cache',
        }
      });
    };

    let currentConnection = connection;
    let subscriptionId: number | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;

    const isConnectionError = (err: any): boolean => {
      // Check if it's an instruction error (these are normal and should be ignored)
      if (err && typeof err === 'object' && 'InstructionError' in err) {
        return false;
      }
      // Check if it's a WebSocket connection error
      if (err && typeof err === 'object' && 'message' in err && 
          (err.message.includes('WebSocket') || err.message.includes('connection'))) {
        return true;
      }
      return false;
    };

    const setupSubscription = async () => {
      try {
        if (subscriptionId !== null) {
          await currentConnection.removeOnLogsListener(subscriptionId);
        }

        subscriptionId = currentConnection.onLogs(
          new PublicKey(MOONSHOT_PROGRAM_ID),
          async ({ logs, err, signature }) => {
            try {
              if (!activeMonitoringSessions.has(socketId)) {
                console.log(chalk.yellow(`Moonshot monitoring stopped for client ${socketId}.`));
                return;
              }

              if (err) {
                // Only log and attempt reconnection for actual connection errors
                if (isConnectionError(err)) {
                  console.error(chalk.red(`Moonshot connection error: ${JSON.stringify(err)}`));
                  await reconnect();
                }
                return;
              }

              // Check if this is a token creation event
              if (!logs.some(log => 
                log.includes('Program log: create') && 
                log.includes('moonshot') &&
                !log.includes('error') // Exclude error logs
              )) {
                return;
              }

              if (processedTransactions.has(signature)) {
                return;
              }
              processedTransactions.add(signature);

              // Parse the transaction to get token details
              const parsedTransaction = await currentConnection.getParsedTransaction(
                signature,
                {
                  maxSupportedTransactionVersion: 0,
                  commitment: 'confirmed',
                }
              );

              if (parsedTransaction && parsedTransaction.meta !== null && parsedTransaction.meta.err == null) {
                // Look for token accounts in the transaction
                const postTokenBalances = parsedTransaction.meta.postTokenBalances;
                const tokenInfo = postTokenBalances?.find(
                  (balance) => {
                    // Check if this is a token account owned by the Moonshot program
                    return balance.owner === MOONSHOT_PROGRAM_ID && 
                           balance.mint !== 'So11111111111111111111111111111111111111112' && // Exclude wrapped SOL
                           balance.uiTokenAmount?.uiAmount && balance.uiTokenAmount.uiAmount > 0; // Ensure token amount is greater than 0
                  }
                );

                if (tokenInfo) {
                  console.log(chalk.bgGreen(`Found new Moonshot token: ${tokenInfo.mint}`));
                  
                  // Get additional token details
                  const tokenMetadata = await fetchTokenMetadata(tokenInfo.mint);
                  const birdeyeData = await fetchBirdeyeData(tokenInfo.mint);
                  
                  // Create enhanced token info
                  const enhancedTokenInfo = {
                    ...tokenInfo,
                    name: tokenMetadata.name || 'Unknown Token',
                    symbol: tokenMetadata.symbol || 'UNKNOWN',
                    image: tokenMetadata.image,
                    price: birdeyeData.price,
                    marketCap: birdeyeData.marketCap,
                    volume24h: birdeyeData.volume24h,
                    timestamp: new Date().toISOString(),
                    eventType: 'New Token',
                    isKingOfHill: false
                  };

                  await sendTokenInfo('all', 'New Moonshot Token Detected!', tokenInfo.mint);
                }
              }
            } catch (error) {
              // Only attempt reconnection for actual connection errors
              if (isConnectionError(error)) {
                console.error(chalk.red('Error in Moonshot token monitoring callback:', error));
                await reconnect();
              }
            }
          },
          'confirmed'
        );
      } catch (error) {
        if (isConnectionError(error)) {
          console.error(chalk.red('Error setting up Moonshot subscription:', error));
          await reconnect();
        }
      }
    };

    const reconnect = async () => {
      try {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error(chalk.red('Max reconnection attempts reached. Stopping Moonshot monitoring.'));
          return;
        }

        reconnectAttempts++;
        console.log(chalk.yellow(`Attempting to reconnect to Moonshot monitoring... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`));
        
        if (subscriptionId !== null) {
          await currentConnection.removeOnLogsListener(subscriptionId);
          subscriptionId = null;
        }
        
        currentConnection = createConnection();
        await setupSubscription();
        console.log(chalk.green('Successfully reconnected to Moonshot monitoring'));
        reconnectAttempts = 0; // Reset counter on successful reconnection
      } catch (error) {
        console.error(chalk.red('Error reconnecting to Moonshot monitoring:', error));
        // Retry reconnection after delay
        setTimeout(reconnect, 5000);
      }
    };

    // Initial setup
    await setupSubscription();

  } catch (error) {
    console.error(chalk.red('Error in Moonshot token monitor:', error));
  }
}

// Send token information to connected clients
async function sendTokenInfo(socketId: string, message: string, tokenAddress: string) {
  try {
    // Fetch token metadata
    const { name: tokenName, symbol: tokenSymbol, image: tokenImageUrl } = await fetchTokenMetadata(tokenAddress);

    // Fetch token score and other data
    const tokenScore = await fetchTokenScore(tokenAddress);
    const { marketCap, price, volume24h } = await fetchBirdeyeData(tokenAddress);

    // Social links will be fetched by the frontend from separate endpoint
    
    // Create token info object
    const tokenInfo = {
      message,
      tokenAddress,
      tokenName: tokenName || 'Unknown',
      tokenSymbol: tokenSymbol || 'UNKNOWN',
      price: price !== null ? price.toFixed(4) : 'N/A',
      marketCap: marketCap !== null ? marketCap : 'N/A',
      volume24h: volume24h !== null ? volume24h.toLocaleString() : 'N/A',
      tokenScore: tokenScore !== null ? tokenScore : null,
      tokenImageUrl: tokenImageUrl || null,
      explorerUrl: `https://explorer.solana.com/address/${tokenAddress}?cluster=mainnet-beta`,
      birdseyeUrl: `https://birdeye.so/token/${tokenAddress}?chain=solana`,
      dexscreenerUrl: `https://dexscreener.com/solana/${tokenAddress}`,
      dextoolsUrl: `https://www.dextools.io/app/en/solana/pair-explorer/${tokenAddress}`,
      jupiterUrl: `https://jup.ag/swap/${tokenAddress}-SOL`,
      raydiumUrl: `https://raydium.io/swap/?inputCurrency=${tokenAddress}&outputCurrency=SOL`,
      timestamp: new Date().toISOString(),
      isKingOfHill: message.includes('King of the Hill')
    };
    
    // Send to specific client or broadcast if socketId is 'all'
    if (socketId === 'all') {
      io.emit('newToken', tokenInfo);
    } else {
      io.to(socketId).emit('newToken', tokenInfo);
    }
    
    // Store the data
    await storeData(dataPath, tokenInfo);
    
    console.log(chalk.green('Token information sent to clients successfully.'));
  } catch (error) {
    console.error(chalk.red('Error sending token info to clients:', error));
  }
}

// Define routes

// API route to get latest tokens
app.get('/api/tokens/latest', (async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(dataPath)) {
      return res.json({ tokens: [] });
    }
    
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const tokens = JSON.parse(rawData);
    
    // Return the most recent 20 tokens
    res.json({ tokens: tokens.slice(-20).reverse() });
  } catch (error) {
    console.error('Error fetching latest tokens:', error);
    res.status(500).json({ error: 'Failed to fetch latest tokens' });
  }
}) as RequestHandler);

// API route to get token details
app.get('/api/token/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    console.log('Fetching token details for:', address);
    
    // Fetch all token details
    const [tokenMetadata, tokenScore, birdeyeData] = await Promise.all([
      fetchTokenMetadata(address),
      fetchTokenScore(address),
      fetchBirdeyeData(address)
    ]);
    
    console.log('Token metadata:', tokenMetadata);
    console.log('Token score:', tokenScore);
    console.log('Birdeye data:', birdeyeData);
    
    const response = {
      address,
      name: tokenMetadata.name || 'Unknown Token',
      symbol: tokenMetadata.symbol || 'UNKNOWN',
      image: tokenMetadata.image,
      score: tokenScore,
      price: birdeyeData.price,
      marketCap: birdeyeData.marketCap,
      volume24h: birdeyeData.volume24h,
      twitter: birdeyeData.twitter,
      telegram: birdeyeData.telegram
    };
    
    console.log('Sending response:', response);
    res.json(response);
  } catch (error) {
    console.error('Error fetching token details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch token details',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API endpoint to handle token swaps
app.post('/api/tokens/swap', ((req: Request, res: Response) => {
  (async () => {
    try {
      const { tokenAddress, userPublicKey, amount, action, slippage = 1 } = req.body;
      
      if (!tokenAddress || !userPublicKey || !amount || !action) {
        res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters' 
        });
        return;
      }
      
      // Convert amount to proper format based on action
      const amountInLamports = action === 'buy' 
        ? Math.floor(parseFloat(amount) * 1e9) // SOL has 9 decimals
        : Math.floor(parseFloat(amount) * 1e6); // Most tokens have 6 decimals
      
      // Determine input and output mints
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const inputMint = action === 'buy' ? SOL_MINT : tokenAddress;
      const outputMint = action === 'buy' ? tokenAddress : SOL_MINT;
      
      console.log(`Processing ${action} swap: ${inputMint} -> ${outputMint} for amount ${amountInLamports}`);
      
      // Get quote from Jupiter API
      const quote = await getSwapQuote(inputMint, outputMint, amountInLamports, slippage);
      
      if (!quote) {
        res.status(500).json({ 
          success: false, 
          message: 'Failed to get swap quote' 
        });
        return;
      }
      
      // Get transaction data
      const swapData = await getSwapTransaction(quote, userPublicKey, true);
      
      if (!swapData || !swapData.swapTransaction) {
        res.status(500).json({ 
          success: false, 
          message: 'Failed to create swap transaction' 
        });
        return;
      }
      
      // Calculate expected output amount
      const expectedOutput = calculateExpectedAmount(quote);
      
      // Return the transaction data to be signed by the client
      res.status(200).json({
        success: true,
        swapTransaction: swapData.swapTransaction,
        expectedOutput,
        quote
      });
    } catch (error: any) {
      console.error('Swap API error:', error);
      res.status(500).json({ 
        success: false, 
        message: `Error processing swap: ${error.message || 'Unknown error'}` 
      });
    }
  })();
}));

// API endpoint to verify a transaction
app.get('/api/transaction/:signature', ((req: Request, res: Response) => {
  (async () => {
    try {
      const { signature } = req.params;
      
      if (!signature) {
        res.status(400).json({ 
          success: false, 
          message: 'Transaction signature is required' 
        });
        return;
      }
      
      // Verify the transaction on the blockchain
      const txStatus = await solanaConnection.getSignatureStatus(signature);
      
      if (!txStatus || !txStatus.value) {
        res.status(404).json({ 
          success: false, 
          message: 'Transaction not found' 
        });
        return;
      }
      
      const confirmed = txStatus.value.confirmationStatus === 'confirmed' || 
                         txStatus.value.confirmationStatus === 'finalized';
      
      res.status(200).json({
        success: true,
        confirmed,
        status: txStatus.value.confirmationStatus,
        signature
      });
    } catch (error: any) {
      console.error('Transaction verification error:', error);
      res.status(500).json({ 
        success: false, 
        message: `Error verifying transaction: ${error.message || 'Unknown error'}` 
      });
    }
  })();
}));

// Socket.io connection handling
io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Client tracking for reconnection scenarios
  const clientLookup = new Map<string, string>();
  
  // Handle start monitoring request
  socket.on('startMonitoring', (data?: {clientId?: string}) => {
    const clientId = socket.id;
    
    // If client provided a previous ID, we can use it to identify reconnections
    if (data && data.clientId && data.clientId !== clientId) {
      console.log(`Client reconnecting with previous ID: ${data.clientId} -> ${clientId}`);
      
      // If there was an active session with the old ID, transfer it
      if (activeMonitoringSessions.has(data.clientId)) {
        console.log(`Transferring monitoring session from ${data.clientId} to ${clientId}`);
        activeMonitoringSessions.delete(data.clientId);
        
        // Transfer the monitoring type settings
        if (clientToMonitoringMap.has(data.clientId)) {
          clientToMonitoringMap.set(clientId, clientToMonitoringMap.get(data.clientId)!);
          clientToMonitoringMap.delete(data.clientId);
        }
      }
      
      // Store the mapping for future reference
      clientLookup.set(data.clientId, clientId);
    }
    
    // Start monitoring for this socket ID
    console.log(`Starting monitoring for client: ${clientId}`);
    
    // Start all monitoring services
    monitorNewTokens(solanaConnection, clientId);
    monitorPumpFunTokens(solanaConnection, clientId);
    monitorMoonshotTokens(solanaConnection, clientId);
    
    // Confirm to the client
    socket.emit('monitoringStarted', { success: true });
  });
  
  // Handle stop monitoring request
  socket.on('stopMonitoring', (data?: {clientId?: string, sync?: boolean}) => {
    const clientId = socket.id;
    const providedId = data?.clientId;
    
    // Check if we should be working with a different client ID
    let idToStop = clientId;
    if (providedId) {
      // If we have a mapping for this ID, use it
      const mappedId = clientLookup.get(providedId);
      if (mappedId) {
        idToStop = mappedId;
      } else if (providedId) {
        // Otherwise use the provided ID if it exists
        idToStop = providedId;
      }
    }
    
    console.log(`Stopping monitoring for client: ${idToStop}`);
    
    if (activeMonitoringSessions.has(idToStop)) {
      // Clean up the monitoring session
      activeMonitoringSessions.delete(idToStop);
      clientToMonitoringMap.delete(idToStop);
      console.log(`Monitoring stopped for client ${idToStop}.`);
      socket.emit('monitoringStopped', { success: true });
    } else {
      // Check for any session associated with this socket
      if (activeMonitoringSessions.has(clientId)) {
        activeMonitoringSessions.delete(clientId);
        clientToMonitoringMap.delete(clientId);
        console.log(`Monitoring stopped for client ${clientId}.`);
        socket.emit('monitoringStopped', { success: true });
      } else {
        console.log(`No active monitoring session found for client ${idToStop} or ${clientId}`);
        socket.emit('monitoringStopped', { 
          success: false, 
          error: 'No active monitoring session found' 
        });
      }
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    const clientId = socket.id;
    console.log(`Client disconnected: ${clientId}, reason: ${reason}`);
    
    // Only cleanup the session if this is a true disconnect, not a temporary one
    if (reason === 'transport close' || reason === 'client namespace disconnect') {
      if (activeMonitoringSessions.has(clientId)) {
        console.log(`Cleaning up monitoring session for disconnected client: ${clientId}`);
        // We'll keep the session briefly to allow for reconnects
        setTimeout(() => {
          // Only delete if it still exists after the timeout
          if (activeMonitoringSessions.has(clientId)) {
            console.log(`Purging stale monitoring session: ${clientId}`);
            activeMonitoringSessions.delete(clientId);
            clientToMonitoringMap.delete(clientId);
          }
        }, 30000); // Give 30 seconds for potential reconnection
      }
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(chalk.green(`Server is running on port ${PORT}`));
  console.log(chalk.yellow('Visit http://localhost:3000 to access the application'));
});