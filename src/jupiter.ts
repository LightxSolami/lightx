import axios from 'axios';

// Jupiter API V6 base URL
const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Get a swap quote from Jupiter API
 * @param tokenMint The token mint address to swap from
 * @param outputMint The token mint address to swap to (default: SOL)
 * @param amount The amount to swap in lamports/smallest denomination
 * @param slippage Slippage tolerance percentage (default: 1%)
 * @returns Jupiter swap quote or null if error
 */
export async function getSwapQuote(
  inputMint: string,
  outputMint: string = SOL_MINT,
  amount: number,
  slippage: number = 1 // 1% default slippage
): Promise<any> {
  try {
    console.log(`Getting swap quote: ${inputMint} -> ${outputMint}, amount: ${amount}, slippage: ${slippage}%`);
    const response = await axios.get(`${JUPITER_API_BASE}/quote`, {
      params: {
        inputMint: inputMint,
        outputMint: outputMint,
        amount: amount.toString(),
        slippageBps: slippage * 100 // Convert percentage to basis points
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error getting swap quote:', error);
    return null;
  }
}

/**
 * Get a swap transaction from Jupiter API
 * @param quoteResponse The quote response from Jupiter API
 * @param userPublicKey The user's public key
 * @param wrapUnwrapSol Whether to wrap/unwrap SOL automatically
 * @returns The swap transaction data
 */
export async function getSwapTransaction(
  quoteResponse: any,
  userPublicKey: string,
  wrapUnwrapSol: boolean = true
): Promise<any> {
  try {
    console.log(`Getting swap transaction for user ${userPublicKey}`);
    const response = await axios.post(`${JUPITER_API_BASE}/swap`, {
      quoteResponse: quoteResponse,
      userPublicKey: userPublicKey,
      wrapAndUnwrapSol: wrapUnwrapSol
    });

    return response.data;
  } catch (error) {
    console.error('Error getting swap transaction:', error);
    throw error;
  }
}

/**
 * Format a swap quote into a human-readable format
 * @param quote The Jupiter swap quote
 * @returns Formatted quote information
 */
export function formatSwapQuote(quote: any): {
  inAmount: string;
  outAmount: string;
  price: string;
  priceImpact: string;
  route: string;
} {
  if (!quote) {
    return {
      inAmount: 'N/A',
      outAmount: 'N/A',
      price: 'N/A',
      priceImpact: 'N/A',
      route: 'N/A'
    };
  }

  const inAmount = (parseInt(quote.inAmount) / 1e9).toFixed(4);
  const outAmount = (parseInt(quote.outAmount) / 1e9).toFixed(4);
  const price = (parseInt(quote.outAmount) / parseInt(quote.inAmount)).toFixed(6);
  const priceImpact = (quote.priceImpactPct * 100).toFixed(2);
  
  // Get route names
  const routeNames = quote.routePlan
    .map((step: any) => step.swapInfo?.label || 'Unknown')
    .join(' → ');

  return {
    inAmount: `${inAmount} SOL`,
    outAmount: `${outAmount} ${quote.outputMint === SOL_MINT ? 'SOL' : 'tokens'}`,
    price: `${price} ${quote.outputMint === SOL_MINT ? 'SOL/token' : 'tokens/SOL'}`,
    priceImpact: `${priceImpact}%`,
    route: routeNames
  };
}

/**
 * Calculate expected amount for a swap
 * @param quote The Jupiter swap quote
 * @returns The formatted expected output amount
 */
export function calculateExpectedAmount(quote: any): string {
  if (!quote || !quote.outAmount) {
    return '0';
  }
  
  const amount = parseInt(quote.outAmount);
  // Format with appropriate decimals based on token type
  if (quote.outputMint === SOL_MINT) {
    return (amount / 1e9).toFixed(4); // SOL has 9 decimals
  } else {
    // For other tokens, we use a generic approach
    return (amount / 1e6).toFixed(2); // Most SPL tokens use 6 decimals
  }
}

/**
 * Create buy buttons for a token
 * @param tokenAddress The token mint address
 * @returns Array of button configurations
 */
export async function createBuyButtons(tokenAddress: string) {
  const solAmounts = [0.1, 0.5, 1];
  const buttons = [];

  // Add preset SOL amount buttons
  for (const amount of solAmounts) {
    try {
      const lamports = Math.floor(amount * 1e9); // Convert SOL to lamports
      buttons.push({
        text: `Buy with ${amount} SOL`,
        callback_data: `buy_${tokenAddress}_${amount}`
      });
    } catch (error) {
      console.error(`Error creating button for ${amount} SOL:`, error);
    }
  }

  // Add custom amount button
  buttons.push({
    text: '💰 Enter custom SOL amount',
    callback_data: `custom_buy_${tokenAddress}`
  });

  return buttons;
}

/**
 * Send a swap transaction to the blockchain
 * @param connection The Solana connection
 * @param transaction The serialized transaction
 * @param signCallback The callback to sign the transaction
 * @returns The transaction signature
 */
export async function sendSwapTransaction(
  connection: any,
  transactionBase64: string,
  signCallback: (transaction: any) => Promise<any>
): Promise<string> {
  try {
    // Deserialize the transaction
    const transaction = deserializeTransaction(transactionBase64);
    
    // Sign the transaction
    const signedTransaction = await signCallback(transaction);
    
    // Send the signed transaction
    const signature = await connection.sendRawTransaction(
      signedTransaction.serialize(),
      { skipPreflight: false, preflightCommitment: 'confirmed' }
    );
    
    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');
    
    return signature;
  } catch (error) {
    console.error('Error sending swap transaction:', error);
    throw error;
  }
}

/**
 * Deserialize a base64 encoded transaction
 * @param transactionBase64 The base64 encoded transaction
 * @returns The deserialized transaction
 */
function deserializeTransaction(transactionBase64: string): any {
  const buffer = Buffer.from(transactionBase64, 'base64');
  // This is a placeholder - in actual usage, you would use the solana/web3.js library
  // to deserialize the transaction
  return {
    serialize: () => buffer,
    // Add other transaction properties as needed
  };
}