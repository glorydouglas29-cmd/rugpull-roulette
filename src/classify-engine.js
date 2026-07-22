// Classify Engine — Exit Liquidity Detector + Countertrade Generator

const SOL_MINT = 'So11111111111111111111111111111111111111112';

function short(addr) {
  return addr.slice(0, 4) + '…' + addr.slice(-4);
}

// ===== TRANSACTION PATTERN ANALYSIS =====
function analyzeTradePatterns(txs) {
  let profitableTrades = 0;
  let losingTrades = 0;
  let breakEvenTrades = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let largestWin = 0;
  let largestLoss = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveLosses = 0;
  let avgHoldTime = 0;
  let holdTimes = [];
  let earlySells = 0; // Sold within 1 hour
  let lateSells = 0; // Held > 30 days
  let botLikePatterns = 0;
  let failedTxCount = 0;

  // Track token buy/sell pairs for P&L
  const tokenTrades = {}; // mint -> { buys: [], sells: [] }

  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    if (tx.error) {
      failedTxCount++;
      continue;
    }

    const changes = tx.balanceChanges || [];
    const solChange = changes
      .filter(c => (c.mint || '').trim() === SOL_MINT)
      .reduce((sum, c) => sum + c.amount, 0);

    // Track per-token trades
    for (const change of changes) {
      if ((change.mint || '').trim() === SOL_MINT) continue;

      const mint = change.mint;
      if (!tokenTrades[mint]) tokenTrades[mint] = { buys: [], sells: [] };

      if (change.amount > 0) {
        tokenTrades[mint].buys.push({
          amount: change.amount,
          timestamp: tx.timestamp,
          solSpent: Math.abs(solChange),
        });
      } else {
        tokenTrades[mint].sells.push({
          amount: Math.abs(change.amount),
          timestamp: tx.timestamp,
          solReceived: solChange > 0 ? solChange : 0,
        });
      }
    }

    // Detect bot patterns: very consistent timing, round amounts
    if (tx.timestamp && i > 0) {
      const timeDiff = Math.abs(tx.timestamp - (txs[i - 1].timestamp || tx.timestamp));
      if (timeDiff > 0 && timeDiff < 60) botLikePatterns++; // Trades within 1 minute
    }
  }

  // Calculate P&L per token
  for (const [mint, trades] of Object.entries(tokenTrades)) {
    const { buys, sells } = trades;
    if (buys.length === 0 || sells.length === 0) continue;

    // Simple FIFO P&L
    let buyQueue = [...buys];
    for (const sell of sells) {
      if (buyQueue.length === 0) break;
      const buy = buyQueue[0];
      const sellAmount = Math.min(sell.amount, buy.amount);
      const buyPricePerUnit = buy.solSpent / buy.amount;
      const sellPricePerUnit = sell.solReceived / sell.amount;
      const pnl = (sellPricePerUnit - buyPricePerUnit) * sellAmount;

      if (pnl > 0) {
        profitableTrades++;
        totalProfit += pnl;
        largestWin = Math.max(largestWin, pnl);
        consecutiveLosses = 0;
      } else if (pnl < 0) {
        losingTrades++;
        totalLoss += Math.abs(pnl);
        largestLoss = Math.max(largestLoss, Math.abs(pnl));
        consecutiveLosses++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
      } else {
        breakEvenTrades++;
        consecutiveLosses = 0;
      }

      // Track hold time
      if (buy.timestamp && sell.timestamp) {
        const holdTime = sell.timestamp - buy.timestamp;
        holdTimes.push(holdTime);
        if (holdTime < 3600) earlySells++;
        if (holdTime > 2592000) lateSells++; // 30 days
      }

      buy.amount -= sellAmount;
      if (buy.amount <= 0.000001) buyQueue.shift();
    }
  }

  const totalTrades = profitableTrades + losingTrades + breakEvenTrades;
  const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;
  avgHoldTime = holdTimes.length > 0
    ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length
    : 0;

  return {
    profitableTrades,
    losingTrades,
    breakEvenTrades,
    totalTrades,
    winRate,
    totalProfit,
    totalLoss,
    netPnl: totalProfit - totalLoss,
    largestWin,
    largestLoss,
    maxConsecutiveLosses,
    avgHoldTime,
    earlySells,
    lateSells,
    botLikePatterns,
    failedTxCount,
    isBot: botLikePatterns > 5 || (totalTrades > 20 && winRate > 0.8),
  };
}

// ===== WALLET CLASSIFICATION =====
export function classifyWallet(walletData) {
  const { balances, transactions, nfts, totalValue, solBalance, tokenCount } = walletData;
  const tradeAnalysis = analyzeTradePatterns(transactions);
  const tokens = balances.filter(b => b.mint !== SOL_MINT);

  // Calculate composite score (0-100, higher = worse)
  let score = 0;
  const factors = [];

  // Win rate factor
  if (tradeAnalysis.totalTrades > 0) {
    const lossRate = 1 - tradeAnalysis.winRate;
    score += lossRate * 30;
    factors.push({ name: 'Loss Rate', value: (lossRate * 100).toFixed(1) + '%', weight: 30 });
  }

  // Consecutive losses
  if (tradeAnalysis.maxConsecutiveLosses > 3) {
    score += Math.min(tradeAnalysis.maxConsecutiveLosses * 3, 15);
    factors.push({ name: 'Consecutive Ls', value: tradeAnalysis.maxConsecutiveLosses, weight: 15 });
  }

  // Early sells (paper hands)
  if (tradeAnalysis.earlySells > 3) {
    score += Math.min(tradeAnalysis.earlySells * 2, 10);
    factors.push({ name: 'Paper Hands', value: tradeAnalysis.earlySells, weight: 10 });
  }

  // Failed transactions
  if (tradeAnalysis.failedTxCount > 5) {
    score += Math.min(tradeAnalysis.failedTxCount, 10);
    factors.push({ name: 'Failed TXs', value: tradeAnalysis.failedTxCount, weight: 10 });
  }

  // Portfolio concentration (too many dust tokens = bad)
  const dustCount = tokens.filter(t => (t.usdValue || 0) < 0.01).length;
  if (dustCount > 5) {
    score += Math.min(dustCount, 10);
    factors.push({ name: 'Dust Tokens', value: dustCount, weight: 10 });
  }

  // Low SOL balance
  if (solBalance < 0.01) {
    score += 10;
    factors.push({ name: 'Broke', value: solBalance.toFixed(4) + ' SOL', weight: 10 });
  }

  // Bot detection
  if (tradeAnalysis.isBot) {
    score += 15;
    factors.push({ name: 'Bot-like', value: 'Yes', weight: 15 });
  }

  score = Math.min(score, 100);

  // Determine classification
  let classification, classificationIcon, classificationColor, description;

  if (tradeAnalysis.isBot) {
    classification = 'BOT / SNIPER';
    classificationIcon = '⚫';
    classificationColor = '#6B7280';
    description = 'This wallet moves faster than humanly possible. Either a bot, a sniper, or someone who really needs to touch grass.';
  } else if (score >= 70) {
    classification = 'EXIT LIQUIDITY';
    classificationIcon = '🔴';
    classificationColor = '#EF4444';
    description = 'You exist to make other people rich. Every trade you make is someone else's profit. The devs have your wallet address on a plaque.';
  } else if (score >= 50) {
    classification = 'PAPER HANDS';
    classificationIcon = '🟡';
    classificationColor = '#F59E0B';
    description = 'You sell too early, buy too late, and panic at the first red candle. Diamond hands? You have wet tissue hands.';
  } else if (score >= 30) {
    classification = 'AVERAGE DEGEN';
    classificationIcon = '🟢';
    classificationColor = '#22C55E';
    description = 'You win some, you lose some. Mostly lose. But hey, at least you're not the worst. That's... something?'
  } else if (score >= 15) {
    classification = 'SMART MONEY';
    classificationIcon = '🔵';
    classificationColor = '#3B82F6';
    description = 'Actually profitable? Consistent wins? Either you're lucky or you know something. Either way, respect.';
  } else {
    classification = 'WHALE / LEGEND';
    classificationIcon = '👑';
    classificationColor = '#F59E0B';
    description = 'You're either a whale, an insider, or a time traveler. Whatever you are, teach us your ways.';
  }

  return {
    classification,
    classificationIcon,
    classificationColor,
    description,
    score: Math.round(score),
    tradeAnalysis,
    factors,
  };
}

// ===== COUNTERTRADE GENERATOR =====
export function generateCountertrade(walletData) {
  const { transactions } = walletData;
  const tradeAnalysis = analyzeTradePatterns(transactions);

  if (tradeAnalysis.totalTrades === 0) {
    return {
      recommendation: 'NO DATA',
      reason: 'Not enough trade history to generate a countertrade strategy.',
      actions: [],
      expectedOutcome: 'Unknown',
    };
  }

  // Get last 5 token trades
  const recentTrades = [];
  const seenMints = new Set();

  for (const tx of transactions) {
    if (tx.error) continue;
    const changes = tx.balanceChanges || [];
    for (const change of changes) {
      if ((change.mint || '').trim() === SOL_MINT) continue;
      if (seenMints.has(change.mint)) continue;
      seenMints.add(change.mint);

      recentTrades.push({
        mint: change.mint,
        action: change.amount > 0 ? 'BUY' : 'SELL',
        amount: Math.abs(change.amount),
        timestamp: tx.timestamp,
      });

      if (recentTrades.length >= 5) break;
    }
    if (recentTrades.length >= 5) break;
  }

  // Generate inverse actions
  const inverseActions = recentTrades.map(t => ({
    original: t.action,
    counter: t.action === 'BUY' ? 'SELL' : 'BUY',
    mint: t.mint,
    amount: t.amount,
    reasoning: t.action === 'BUY'
      ? `They bought this. You should probably sell it (or never buy it).`
      : `They sold this. Maybe it's actually good? Or they're paper-handing again.`,
  }));

  let recommendation, expectedOutcome;

  if (tradeAnalysis.winRate < 0.3) {
    recommendation = 'STRONG COUNTERTRADE';
    expectedOutcome = 'Historically, doing the opposite of this wallet is highly profitable. They have a ' +
      (tradeAnalysis.winRate * 100).toFixed(1) + '% win rate. Inverse = ' +
      ((1 - tradeAnalysis.winRate) * 100).toFixed(1) + '% win rate.';
  } else if (tradeAnalysis.winRate < 0.5) {
    recommendation = 'MODERATE COUNTERTRADE';
    expectedOutcome = 'This wallet loses more than it wins. Countertrading has edge, but not guaranteed.';
  } else if (tradeAnalysis.winRate > 0.7) {
    recommendation = 'COPY, DON'T COUNTER';
    expectedOutcome = 'This wallet actually wins. You should COPY their trades, not counter them. Are you sure you want to inverse smart money?';
  } else {
    recommendation = 'FLIP A COIN';
    expectedOutcome = 'This wallet is basically a coin flip. Countertrading has no edge here.';
  }

  return {
    recommendation,
    winRate: tradeAnalysis.winRate,
    totalTrades: tradeAnalysis.totalTrades,
    recentTrades: inverseActions,
    expectedOutcome,
    disclaimer: 'This is satire. Not financial advice. DYOR. Please.',
  };
}
