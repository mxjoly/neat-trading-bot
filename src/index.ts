import { Bot } from './bot';
import { StrategyConfig } from './init';
import { loadNeuralNetwork } from './training/saveManager';

if (process.env.NODE_ENV !== 'test') {
  const tradingBot = new Bot(StrategyConfig, loadNeuralNetwork());
  tradingBot.prepare();
  tradingBot.run();
}
