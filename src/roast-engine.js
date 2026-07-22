// Roast Engine — generates savage roasts from wallet data

const SOL_MINT = 'So11111111111111111111111111111111111111112';

function short(addr) {
  return addr.slice(0, 4) + '…' + addr.slice(-4);
}

function fmtUsd(n) {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  if (n < 0.01) return '<$0.01';
  if (n < 1000) return '$' + n.toFixed(2);
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ===== MEMECOIN DETECTION =====
const MEME_KEYWORDS = [
  'DOGE', 'PEPE', 'SHIB', 'BONK', 'WIF', 'MOO', 'PUMP', 'FART',
  'CHAD', 'WOJAK', 'BOBO', 'APU', 'BRETT', 'ANDY', 'TURBO',
  'HARRY', 'PONKE', 'POPCAT', 'MOG', 'SPX', 'GIGA', 'MICKEY',
  'TRUMP', 'BIDEN', 'USA', 'HABIBI', 'BOME', 'SLERF', 'WEN',
  'MEW', 'MANEKI', 'BOME', 'PENG', 'MYRO', 'SC', 'HONEY',
  'DUST', 'DEGEN', 'BASED', 'RETARD', 'NORMIE', 'JEET',
];

function isMemecoin(symbol, name) {
  const s = (symbol || '').toUpperCase();
  const n = (name || '').toUpperCase();
  return MEME_KEYWORDS.some(k => s.includes(k) || n.includes(k));
}

// ===== TRANSACTION ANALYSIS =====
function analyzeTransactions(txs) {
  let failedTxCount = 0;
  let buyAtTopCount = 0;
  let sellAtBottomCount = 0;
  let totalTxValue = 0;
  let txWithValue = 0;
  let uniqueDays = new Set();
  let solSpent = 0;
  let solReceived = 0;
  let tokenBuys = 0;
  let tokenSells = 0;
  let largestLoss = 0;
  let largestWin = 0;

  for (const tx of txs) {
    if (tx.error) {
      failedTxCount++;
      continue;
    }

    if (tx.timestamp) {
      uniqueDays.add(new Date(tx.timestamp * 1000).toDateString());
    }

    const changes = tx.balanceChanges || [];
    for (const change of changes) {
      const absAmount = Math.abs(change.amount);
      if (absAmount > 0) {
        totalTxValue += absAmount;
        txWithValue++;
      }

      const isSol = (change.mint || '').trim() === SOL_MINT;
      if (isSol) {
        if (change.amount < 0) {
          solSpent += Math.abs(change.amount);
        } else {
          solReceived += change.amount;
        }
      }

      // Heuristic: tiny token amount + SOL spent = likely bought at top
      if (change.amount > 0 && change.amount < 0.001 && !isSol) {
        buyAtTopCount++;
      }
      if (change.amount < 0 && Math.abs(change.amount) < 0.001 && !isSol) {
        sellAtBottomCount++;
      }

      // Track buys/sells
      if (change.amount > 0 && !isSol) tokenBuys++;
      if (change.amount < 0 && !isSol) tokenSells++;
    }
  }

  const netSol = solReceived - solSpent;
  const avgTxValue = txWithValue > 0 ? totalTxValue / txWithValue : 0;
  const activityScore = uniqueDays.size;

  return {
    failedTxCount,
    buyAtTopCount: Math.min(buyAtTopCount, 10),
    sellAtBottomCount: Math.min(sellAtBottomCount, 10),
    avgTxValue,
    activityScore,
    uniqueDays: uniqueDays.size,
    solSpent,
    solReceived,
    netSol,
    tokenBuys,
    tokenSells,
    tradeRatio: tokenSells > 0 ? tokenBuys / tokenSells : tokenBuys,
  };
}

// ===== ROAST GENERATION =====
export function generateRoast(walletData) {
  const roasts = [];
  const { balances, transactions, nfts, totalValue, solBalance, tokenCount } = walletData;

  const txAnalysis = analyzeTransactions(transactions);
  const tokens = balances.filter(b => b.mint !== SOL_MINT && (b.symbol || '').toUpperCase() !== 'SOL');
  const memecoins = tokens.filter(t => isMemecoin(t.symbol, t.name));
  const dustTokens = tokens.filter(t => (t.usdValue || 0) < 0.01 && t.balance > 0);

  // === SOL BALANCE ROASTS ===
  if (solBalance < 0.001) {
    roasts.push({
      type: 'savage',
      icon: '💀',
      title: 'Ghost Wallet',
      text: `You have ${solBalance.toFixed(6)} SOL. This wallet is so empty it echoes. Even scammers feel sorry for you.`,
      severity: 10,
    });
  } else if (solBalance < 0.01) {
    roasts.push({
      type: 'savage',
      icon: '🪙',
      title: 'Dust Collector',
      text: `${solBalance.toFixed(4)} SOL? You can't afford a single transaction with priority fee. Your wallet is basically a museum exhibit.`,
      severity: 9,
    });
  } else if (solBalance < 0.1) {
    roasts.push({
      type: 'savage',
      icon: '⛽',
      title: 'Gas Money Only',
      text: `${solBalance.toFixed(4)} SOL — that's barely enough for 2 transactions. Every click costs you sleep.`,
      severity: 7,
    });
  } else if (solBalance > 100) {
    roasts.push({
      type: 'backhanded',
      icon: '🐋',
      title: 'Solana Maximalist',
      text: `${solBalance.toFixed(2)} SOL just sitting there. You know there's this thing called "DeFi" right? Or are you waiting for $10,000 SOL?`,
      severity: 4,
    });
  }

  // === PORTFOLIO VALUE ROASTS ===
  if (totalValue < 1) {
    roasts.push({
      type: 'savage',
      icon: '📉',
      title: 'Portfolio Value: A Gumball',
      text: `${fmtUsd(totalValue)} total value. I've found more money in my couch cushions. Your wallet is a participation trophy.`,
      severity: 10,
    });
  } else if (totalValue < 10) {
    roasts.push({
      type: 'savage',
      icon: '🍬',
      title: 'Candy Money Portfolio',
      text: `${fmtUsd(totalValue)}. That's not a portfolio, that's a vending machine budget. Keep dreaming, degen.`,
      severity: 9,
    });
  } else if (totalValue < 100) {
    roasts.push({
      type: 'savage',
      icon: '🎰',
      title: 'Small Ballin'',
      text: `${fmtUsd(totalValue)}. You're not poor, you're just "early." That's what you tell yourself at 3 AM, right?`,
      severity: 7,
    });
  } else if (totalValue > 50000) {
    roasts.push({
      type: 'backhanded',
      icon: '💎',
      title: 'Whale Alert... Maybe',
      text: `${fmtUsd(totalValue)}? Impressive. But let's be real — this was probably 3x higher before you discovered leverage trading.`,
      severity: 3,
    });
  }

  // === MEMECOIN ROASTS ===
  if (memecoins.length >= 5) {
    const names = memecoins.slice(0, 3).map(t => t.symbol || short(t.mint)).join(', ');
    roasts.push({
      type: 'savage',
      icon: '🎪',
      title: 'Memecoin Carnival',
      text: `Holding ${memecoins.length} memecoins including ${names}... Your portfolio is a circus and you're the clown. The devs thank you for your service.`,
      severity: 9,
    });
  } else if (memecoins.length >= 2) {
    const names = memecoins.map(t => t.symbol || short(t.mint)).join(', ');
    roasts.push({
      type: 'savage',
      icon: '🃏',
      title: 'Memecoin Gambler',
      text: `${memecoins.length} memecoins: ${names}. Your investment thesis is "this one feels different." Spoiler: it's not.`,
      severity: 7,
    });
  } else if (memecoins.length === 1) {
    roasts.push({
      type: 'mild',
      icon: '🎯',
      title: 'One Memecoin Wonder',
      text: `Just one memecoin: ${memecoins[0].symbol || short(memecoins[0].mint)}. At least you're committed to losing money efficiently.`,
      severity: 5,
    });
  }

  // === DUST TOKEN ROASTS ===
  if (dustTokens.length > 10) {
    roasts.push({
      type: 'savage',
      icon: '🪦',
      title: 'Token Cemetery',
      text: `${dustTokens.length} tokens worth less than a penny. Your wallet is a graveyard of dead projects. Each one has a story. Each one ends in tears.`,
      severity: 8,
    });
  } else if (dustTokens.length > 5) {
    roasts.push({
      type: 'savage',
      icon: '🧹',
      title: 'Dust Bunny Farm',
      text: `${dustTokens.length} dust tokens. You could sweep your wallet and still have nothing.`,
      severity: 6,
    });
  }

  // === TRANSACTION ROASTS ===
  if (txAnalysis.failedTxCount > 10) {
    roasts.push({
      type: 'savage',
      icon: '💸',
      title: 'Gas Donation Machine',
      text: `${txAnalysis.failedTxCount} failed transactions. You've spent more on failed gas fees than most people have in their entire wallet. The validators love you.`,
      severity: 9,
    });
  } else if (txAnalysis.failedTxCount > 5) {
    roasts.push({
      type: 'savage',
      icon: '❌',
      title: 'Transaction Failure Artist',
      text: `${txAnalysis.failedTxCount} failed transactions. You're paying SOL to learn that slippage exists. Expensive education.`,
      severity: 7,
    });
  }

  if (txAnalysis.buyAtTopCount > 5) {
    roasts.push({
      type: 'savage',
      icon: '📈',
      title: 'Professional Top Buyer',
      text: `Bought the top ${txAnalysis.buyAtTopCount} times. Your timing is so bad you could sell ice to Eskimos and they'd return it. You're not an investor — you're exit liquidity with a seed phrase.`,
      severity: 10,
    });
  } else if (txAnalysis.buyAtTopCount > 2) {
    roasts.push({
      type: 'savage',
      icon: '🎯',
      title: 'Top Buyer in Training',
      text: `${txAnalysis.buyAtTopCount} top buys detected. You're getting good at this. Too good. Have you considered doing the opposite of your instincts?`,
      severity: 7,
    });
  }

  if (txAnalysis.sellAtBottomCount > 5) {
    roasts.push({
      type: 'savage',
      icon: '📉',
      title: 'Panic Seller Supreme',
      text: `Sold at the bottom ${txAnalysis.sellAtBottomCount} times. Paper hands so weak they dissolve in water. Every token you sell pumps 10x the next day. It's not a curse, it's a skill.`,
      severity: 9,
    });
  }

  if (txAnalysis.uniqueDays < 3 && transactions.length > 10) {
    roasts.push({
      type: 'savage',
      icon: '⚡',
      title: 'Binge Trader',
      text: `${transactions.length} transactions in ${txAnalysis.uniqueDays} days. You don't trade, you panic. Touch grass. Please.`,
      severity: 7,
    });
  }

  if (txAnalysis.netSol < -1) {
    roasts.push({
      type: 'savage',
      icon: '🔥',
      title: 'SOL Incinerator',
      text: `Net SOL flow: ${txAnalysis.netSol.toFixed(4)} SOL. You've burned more SOL than a bonfire. The ecosystem thanks you for your sacrifice.`,
      severity: 8,
    });
  }

  // === NFT ROASTS ===
  if (nfts.length === 0) {
    roasts.push({
      type: 'mild',
      icon: '🖼️',
      title: 'NFT-Free Zone',
      text: `Zero NFTs. Either you're smart and avoided the JPEG bubble, or you got rugged so hard you swore them off forever.`,
      severity: 3,
    });
  } else if (nfts.length > 30) {
    roasts.push({
      type: 'savage',
      icon: '🎨',
      title: 'JPEG Museum Curator',
      text: `${nfts.length} NFTs. Your wallet is a digital art gallery of bad decisions. Each one has a story. Each story ends with "I thought it would pump."`,
      severity: 7,
    });
  } else if (nfts.length > 10) {
    roasts.push({
      type: 'savage',
      icon: '🖼️',
      title: 'NFT Enthusiast',
      text: `${nfts.length} NFTs. You don't collect art, you collect Ls.`,
      severity: 5,
    });
  }

  // === TOKEN DIVERSITY ROASTS ===
  if (tokenCount === 0 && solBalance > 0) {
    roasts.push({
      type: 'mild',
      icon: '🛡️',
      title: 'SOL Maxi',
      text: `Only SOL, no tokens. You're either a purist or too scared to ape into anything. Respect the caution, but where's the fun?`,
      severity: 3,
    });
  } else if (tokenCount > 50) {
    roasts.push({
      type: 'savage',
      icon: '🌪️',
      title: 'Token Tornado',
      text: `${tokenCount} different tokens. You're not diversified, you're diluted. You probably don't even know what half of these do.`,
      severity: 6,
    });
  }

  // === FALLBACK ROASTS ===
  if (roasts.length === 0) {
    if (totalValue > 1000) {
      roasts.push({
        type: 'mild',
        icon: '🤔',
        title: 'Suspiciously Normal',
        text: `This wallet looks... fine? Either you're actually competent (boring) or you're hiding the real degen wallet somewhere else.`,
        severity: 2,
      });
    } else {
      roasts.push({
        type: 'mild',
        icon: '😐',
        title: 'The Invisible Degen',
        text: `Not much to roast here. Small portfolio, few transactions. You're either new or you're playing with a burner wallet. We see you.`,
        severity: 3,
      });
    }
  }

  // Calculate average severity
  const avgSeverity = roasts.reduce((sum, r) => sum + r.severity, 0) / roasts.length;

  // Classification
  let classification, classificationIcon, classificationColor;
  if (avgSeverity >= 8) {
    classification = 'EXIT LIQUIDITY';
    classificationIcon = '🔴';
    classificationColor = '#EF4444';
  } else if (avgSeverity >= 5.5) {
    classification = 'PAPER HANDS';
    classificationIcon = '🟡';
    classificationColor = '#F59E0B';
  } else if (avgSeverity >= 3) {
    classification = 'AVERAGE DEGEN';
    classificationIcon = '🟢';
    classificationColor = '#22C55E';
  } else {
    classification = 'SMART MONEY (allegedly)';
    classificationIcon = '🔵';
    classificationColor = '#3B82F6';
  }

  // Summary roasts
  const summaryRoasts = [
    "This wallet belongs in a museum. Not the good kind.",
    "I've seen better portfolios in a dumpster fire.",
    "Your wallet is a masterclass in what NOT to do.",
    "If losing money was a sport, you'd be MVP.",
    "This wallet is proof that hope is not a strategy.",
    "Your trading strategy: buy high, sell low, blame the devs.",
    "You're not down bad, you're down catastrophic.",
    "This wallet has seen more red than a butcher shop.",
    "Your portfolio is a cautionary tale.",
    "Even a stopped clock is right twice a day. Your wallet? Never.",
    "You've turned diamond hands into dust.",
    "Your wallet is where dreams go to die.",
    "Not financial advice, but maybe stop.",
    "Your wallet is a tragedy in slow motion.",
    "You've achieved the impossible: losing money in a bull market.",
  ];

  return {
    roasts: roasts.sort((a, b) => b.severity - a.severity),
    classification,
    classificationIcon,
    classificationColor,
    summaryRoast: summaryRoasts[Math.floor(Math.random() * summaryRoasts.length)],
    score: Math.round(avgSeverity * 10) / 10,
    stats: {
      totalValue,
      solBalance,
      tokenCount,
      nftCount: nfts.length,
      memecoinCount: memecoins.length,
      dustTokenCount: dustTokens.length,
      failedTxCount: txAnalysis.failedTxCount,
      buyAtTopCount: txAnalysis.buyAtTopCount,
      sellAtBottomCount: txAnalysis.sellAtBottomCount,
      uniqueDays: txAnalysis.uniqueDays,
      netSol: txAnalysis.netSol,
    },
  };
}
