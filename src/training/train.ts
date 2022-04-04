import chalk from 'chalk';
import Binance from 'binance-api-node';
import Config from '../config';
import { decimalCeil, decimalFloor } from '../utils/math';
import { loadCandlesFromCSV } from '../utils/loadCandleData';
import Trader from '../core/player';
import Population from '../core/population';
import { loadNeuralNetwork, saveNeuralNetwork } from './saveManager';
import { calculateIndicators } from './indicators';
import {
  CANDLE_MIN_LENGTH,
  NEURAL_NETWORK_INPUTS,
  NEURAL_NETWORK_OUTPUTS,
  startDateTraining,
  endDateTraining,
  totalGenerations,
  totalPopulation,
  initialCapital,
  winRate,
  profitRatio,
  maxRelativeDrawdown,
  startDateTest,
  endDateTest,
} from './loadConfig';
import { BackTestBot } from '../backtest/bot';

/**
 * To print a value with a color code (green when it's positive, red if it's negative)
 * @param value
 * @param pivotValue
 * @param addPercentageSymbol- Add a % symbol next to the value
 */
function coloredValue(
  value: number,
  pivotValue = 0,
  addPercentageSymbol = false
) {
  if (value >= pivotValue) {
    return chalk.greenBright(
      value.toString().concat(addPercentageSymbol ? '%' : '')
    );
  } else {
    return chalk.redBright(
      value.toString().concat(addPercentageSymbol ? '%' : '')
    );
  }
}

/**
 * Display stats of the best trader
 * @param bestTrader
 */
function displayBestTraderStats(bestTrader: Trader) {
  let {
    bestScore,
    wallet,
    stats: {
      totalProfit,
      totalLoss,
      totalFees,
      winningTrades,
      totalTrades,
      longWinningTrades,
      shortWinningTrades,
      longLostTrades,
      shortLostTrades,
      maxRelativeDrawdown,
    },
  } = bestTrader;

  bestScore = decimalFloor(bestScore, 2);
  totalProfit = decimalFloor(totalProfit, 2);
  totalLoss = decimalFloor(Math.abs(totalLoss), 2);
  totalFees = decimalFloor(Math.abs(totalFees), 2);
  let profitRatio = decimalFloor(totalProfit / (totalLoss + totalFees), 2);
  let totalBalance = decimalFloor(wallet.totalWalletBalance, 2);
  let winRate = decimalFloor((winningTrades / totalTrades) * 100, 2);
  let roi = decimalFloor(
    ((wallet.totalWalletBalance - initialCapital) * 100) / initialCapital,
    2
  );
  let maxRelDrawdown = decimalCeil(maxRelativeDrawdown * 100, 2);
  let totalWinningTrades = longWinningTrades + shortWinningTrades;
  let totalLostTrades = longLostTrades + shortLostTrades;
  let averageProfit = decimalFloor(totalProfit / totalWinningTrades, 2);
  let averageLoss = decimalFloor(totalLoss / totalLostTrades, 2);

  console.log(`------------ Best Trader Ever ------------`);
  console.log(`Score: ${coloredValue(bestScore)}`);
  console.log(`ROI: ${coloredValue(roi, 0, true)}`);
  console.log(`Balance: ${coloredValue(totalBalance, initialCapital)}`);
  console.log(`Trades: ${totalTrades}`);
  console.log(`Trades won: ${totalWinningTrades}`);
  console.log(`Trades lost: ${totalLostTrades}`);
  console.log(
    `Max Relative Drawdown: ${coloredValue(maxRelDrawdown, 1, true)}`
  );
  console.log(`Win rate: ${coloredValue(winRate, 50, true)}`);
  console.log(`Longs: ${longWinningTrades + longLostTrades}`);
  console.log(`Shorts: ${shortWinningTrades + shortLostTrades}`);
  console.log(
    `Profit Ratio: ${coloredValue(isNaN(profitRatio) ? 0 : profitRatio, 1)}`
  );
  console.log(`Total Profit: ${coloredValue(totalProfit, 0)}`);
  console.log(`Total Loss: ${coloredValue(-totalLoss, 0)}`);
  console.log(`Total Fees: ${coloredValue(-totalFees, 0)}`);
  console.log(
    `Average profit: ${coloredValue(
      isNaN(averageProfit) ? 0 : averageProfit,
      0
    )}`
  );
  console.log(
    `Average loss: ${coloredValue(isNaN(-averageLoss) ? 0 : -averageLoss, 0)}`
  );
  console.log(`-------------------------------------`);
  console.log(``);
}

/**
 * Train the traders to find the best genome
 */
export async function train(useSave?: boolean) {
  const binanceClient = Binance({
    apiKey: process.env.BINANCE_PUBLIC_KEY,
    apiSecret: process.env.BINANCE_PRIVATE_KEY,
  });

  const exchangeInfo = await binanceClient.futuresExchangeInfo();
  const strategyConfig = Config;

  let historicCandleData = await loadCandlesFromCSV(
    strategyConfig.asset + strategyConfig.base,
    strategyConfig.interval,
    startDateTraining,
    endDateTraining
  );

  let goals = {
    winRate: winRate,
    profitRatio: profitRatio,
    maxRelativeDrawdown: maxRelativeDrawdown,
  };

  let population = new Population({
    size: totalPopulation,
    player: {
      genomeInputs: NEURAL_NETWORK_INPUTS,
      genomeOutputs: NEURAL_NETWORK_OUTPUTS,
      strategyConfig,
      binanceClient,
      exchangeInfo,
      initialCapital,
      goals,
      brain: useSave ? loadNeuralNetwork() : null,
    },
  });

  let indicators = calculateIndicators(historicCandleData);

  for (let gen = 0; gen < totalGenerations; gen++) {
    for (let i = 0; i < historicCandleData.length; i++) {
      if (i < CANDLE_MIN_LENGTH) continue;

      let candles = historicCandleData.slice(
        i - CANDLE_MIN_LENGTH < 0 ? 0 : i - CANDLE_MIN_LENGTH,
        i
      );
      let currentPrice = candles[candles.length - 1].close;

      if (!population.done() && i < historicCandleData.length - 1) {
        // if any players are alive then update them
        population.updateAlive(
          strategyConfig,
          candles,
          currentPrice,
          indicators.map((v) => v[i])
        );
      } else {
        // genetic algorithm
        population.naturalSelection();
      }
    }

    console.log(
      `============================== Generation ${gen} ==============================`
    );

    console.log(
      `Average Fitness: ${coloredValue(
        population.getAvgFitnessSum() / population.species.length,
        0
      )}`
    );

    let bestTrader = population.bestPlayer;
    displayBestTraderStats(bestTrader);

    saveNeuralNetwork(population.bestPlayer.brain);
  }

  let test = new BackTestBot(
    strategyConfig,
    startDateTest,
    endDateTest,
    initialCapital,
    population.bestPlayer.brain
  );

  test.prepare();
  test.run();
}

// Use save file of the previous neural network
const useSave = process.argv[2]
  ? process.argv[2].split('=')[1] === 'true'
    ? true
    : false
  : false;

train(useSave);
