// Cloudflare Worker: Rugpull Roulette + Exit Liquidity Detector
// Single entry point for all API routes

import { generateRoast } from './roast-engine.js';
import { classifyWallet, generateCountertrade } from './classify-engine.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function corsResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders },
  });
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return corsResponse(JSON.stringify(data), status, {
    'Content-Type': 'application/json',
    ...extraHeaders,
  });
}

function isValidSolanaAddress(addr) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

function short(addr) {
  return addr.slice(0, 4) + '…' + addr.slice(-4);
}

// ===== DATA FETCHING =====
async function fetchHelius(endpoint) {
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`Helius error: ${res.status}`);
  return res.json();
}

async function fetchJupiterPrices(mints) {
  if (mints.length === 0) return {};
  const priceMap = {};
  for (let i = 0; i < mints.length; i += 50) {
    const batch = mints.slice(i, i + 50);
    try {
      const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${batch.join(',')}`);
      if (res.ok) {
        const data = await res.json();
        Object.assign(priceMap, data.data || {});
      }
    } catch (e) {
      console.warn('Jupiter fetch failed:', e);
    }
  }
  return priceMap;
}

async function getWalletData(address, apiKey) {
  // Parallel fetch all data
  const [balancesRes, txRes, nftRes] = await Promise.all([
    fetchHelius(`https://api.helius.xyz/v1/wallet/${address}/balances?api-key=${apiKey}`),
    fetchHelius(`https://api.helius.xyz/v1/wallet/${address}/history?api-key=${apiKey}&limit=50`),
    fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'roast',
        method: 'getAssetsByOwner',
        params: { ownerAddress: address, page: 1, limit: 50 },
      }),
    }).then(r => r.json()),
  ]);

  const balances = balancesRes.balances || [];
  const solEntry = balances.find(b =>
    (b.mint || '').trim() === SOL_MINT ||
    (b.symbol || '').trim().toUpperCase() === 'SOL'
  );
  const solBalance = solEntry ? solEntry.balance : 0;
  const tokens = balances.filter(b => b.mint !== SOL_MINT && (b.symbol || '').toUpperCase() !== 'SOL');

  // Jupiter price fallback
  const unpricedMints = [solEntry, ...tokens]
    .filter(b => b && b.usdValue == null && b.mint)
    .map(b => b.mint);

  const jupiterPrices = await fetchJupiterPrices(unpricedMints);
  let jupiterTotal = 0;

  for (const token of [solEntry, ...tokens]) {
    if (!token) continue;
    const price = jupiterPrices[token.mint]?.usdPrice;
    if (price != null && token.usdValue == null) {
      token.usdValue = token.balance * price;
      jupiterTotal += token.usdValue;
    }
  }

  const totalValue = (balancesRes.totalUsdValue || 0) + jupiterTotal;
  const nfts = (nftRes.result?.items || [])
    .filter(i => i.interface === 'V1_NFT' || i.interface === 'ProgrammableNFT');

  return {
    address,
    balances: [solEntry, ...tokens].filter(Boolean),
    transactions: txRes.data || [],
    nfts,
    totalValue,
    solBalance,
    tokenCount: tokens.length,
    nftCount: nfts.length,
  };
}

// ===== LEADERBOARD (KV) =====
async function updateLeaderboard(walletData, classification, env) {
  if (!env.LEADERBOARD_KV) return;

  const key = `wallet:${walletData.address}`;
  const existing = await env.LEADERBOARD_KV.get(key);
  const entry = existing ? JSON.parse(existing) : {
    address: walletData.address,
    shortAddr: short(walletData.address),
    firstSeen: Date.now(),
    lookups: 0,
  };

  entry.lookups++;
  entry.lastSeen = Date.now();
  entry.totalValue = walletData.totalValue;
  entry.solBalance = walletData.solBalance;
  entry.tokenCount = walletData.tokenCount;
  entry.nftCount = walletData.nftCount;
  entry.classification = classification.classification;
  entry.classificationIcon = classification.classificationIcon;
  entry.classificationColor = classification.classificationColor;
  entry.score = classification.score;

  await env.LEADERBOARD_KV.put(key, JSON.stringify(entry));
}

async function getLeaderboard(env, sort = 'worst', limit = 20) {
  if (!env.LEADERBOARD_KV) return [];

  const entries = [];
  const list = await env.LEADERBOARD_KV.list({ limit: 1000 });

  for (const key of list.keys) {
    const data = await env.LEADERBOARD_KV.get(key.name);
    if (data) entries.push(JSON.parse(data));
  }

  // Sort by score (higher = worse)
  entries.sort((a, b) => sort === 'best' ? a.score - b.score : b.score - a.score);
  return entries.slice(0, limit);
}

// ===== MAIN HANDLER =====
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    // Health check
    if (path === '/api/health') {
      return jsonResponse({ status: 'roasting', timestamp: Date.now() });
    }

    const apiKey = env.HELIUS_API_KEY;
    if (!apiKey) {
      return jsonResponse({ error: 'HELIUS_API_KEY not configured' }, 500);
    }

    // ===== ROAST ENDPOINT =====
    if (path === '/api/roast') {
      const address = url.searchParams.get('address');
      if (!address) return jsonResponse({ error: 'Missing address' }, 400);
      if (!isValidSolanaAddress(address)) return jsonResponse({ error: 'Invalid Solana address' }, 400);

      try {
        const walletData = await getWalletData(address, apiKey);
        const roast = generateRoast(walletData);
        return jsonResponse(roast);
      } catch (err) {
        console.error('Roast error:', err);
        return jsonResponse({ error: err.message }, 502);
      }
    }

    // ===== CLASSIFY ENDPOINT =====
    if (path === '/api/classify') {
      const address = url.searchParams.get('address');
      if (!address) return jsonResponse({ error: 'Missing address' }, 400);
      if (!isValidSolanaAddress(address)) return jsonResponse({ error: 'Invalid Solana address' }, 400);

      try {
        const walletData = await getWalletData(address, apiKey);
        const classification = classifyWallet(walletData);
        const countertrade = generateCountertrade(walletData);

        // Update leaderboard
        await updateLeaderboard(walletData, classification, env);

        return jsonResponse({
          address,
          shortAddr: short(address),
          classification,
          countertrade,
          stats: {
            totalValue: walletData.totalValue,
            solBalance: walletData.solBalance,
            tokenCount: walletData.tokenCount,
            nftCount: walletData.nftCount,
            txCount: walletData.transactions.length,
          },
        });
      } catch (err) {
        console.error('Classify error:', err);
        return jsonResponse({ error: err.message }, 502);
      }
    }

    // ===== COUNTERTRADE ENDPOINT =====
    if (path === '/api/countertrade') {
      const address = url.searchParams.get('address');
      if (!address) return jsonResponse({ error: 'Missing address' }, 400);
      if (!isValidSolanaAddress(address)) return jsonResponse({ error: 'Invalid Solana address' }, 400);

      try {
        const walletData = await getWalletData(address, apiKey);
        const countertrade = generateCountertrade(walletData);
        return jsonResponse(countertrade);
      } catch (err) {
        console.error('Countertrade error:', err);
        return jsonResponse({ error: err.message }, 502);
      }
    }

    // ===== LEADERBOARD ENDPOINT =====
    if (path === '/api/leaderboard') {
      const sort = url.searchParams.get('sort') || 'worst';
      const limit = parseInt(url.searchParams.get('limit') || '20');

      try {
        const entries = await getLeaderboard(env, sort, limit);
        return jsonResponse({
          entries,
          sort,
          total: entries.length,
          generatedAt: Date.now(),
        });
      } catch (err) {
        console.error('Leaderboard error:', err);
        return jsonResponse({ error: err.message }, 502);
      }
    }

    // ===== STATIC FRONTEND =====
    if (path === '/' || path === '/index.html') {
      const html = await env.ASSETS ? env.ASSETS.get('index.html') : null;
      if (html) {
        return new Response(html, { headers: { 'Content-Type': 'text/html' } });
      }
      return jsonResponse({ error: 'Frontend not found. Deploy static assets to Pages.' }, 404);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};
