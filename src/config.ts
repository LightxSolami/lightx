import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from the .env file
dotenv.config();

// Default RPC endpoint and WebSocket endpoint (using the environment variables)
const RPC_ENDPOINT = process.env.RPC_ENDPOINT ?? 'https://mainnet.helius-rpc.com/?api-key=cd716db1-6133-46b4-9f2f-59f5b72c329b';
const RPC_WEBSOCKET_ENDPOINT = process.env.RPC_WEBSOCKET_ENDPOINT ?? 'wss://mainnet.helius-rpc.com/?api-key=cd716db1-6133-46b4-9f2f-59f5b72c329b';

// Establish the Solana connection
export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});

// The PublicKey for rayFee (trusted constant)
export const rayFee = new PublicKey('7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5');

// Chat ID storage
const CONFIG_PATH = path.join(__dirname, 'chatIds.json');

// Load chat IDs from file (or create an empty array if the file doesn't exist)
export let CHAT_IDS: number[] = [];
try {
  const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
  CHAT_IDS = JSON.parse(data);
} catch (err) {
  console.log('No chat IDs file found. Creating a new one.');
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(CHAT_IDS), 'utf-8');
}

// Function to add a new chat ID and save it to the file
export const addChatId = (chatId: number) => {
  if (!CHAT_IDS.includes(chatId)) {
    CHAT_IDS.push(chatId);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(CHAT_IDS), 'utf-8');
    console.log(`Added new chat ID: ${chatId}`);
  }
};