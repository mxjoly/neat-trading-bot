import { BotConfig, StrategyConfig } from '../init';
import { loadNeuralNetwork } from '../training/saveManager';
import { BackTestBot } from './bot';

if (process.env.NODE_ENV === 'test') {
  const BacktestConfig = BotConfig['backtest'];
  const startDate = new Date(BacktestConfig['start_date']);
  const endDate = new Date(BacktestConfig['end_date']);
  const initialCapital = BacktestConfig['initial_capital'];

  const bot = new BackTestBot(
    StrategyConfig,
    startDate,
    endDate,
    initialCapital,
    loadNeuralNetwork()
  );

  bot.prepare();
  bot.run();
}
