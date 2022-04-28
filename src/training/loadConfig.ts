import { BotConfig } from '../init';

// ========================== STRATEGY CONFIG  ========================== //

export const StrategyConfig = require('../config.js').default;

// ========================== BOT CONFIG (json file) ========================== //

const NeatConfig = BotConfig['neat'];
export const NeuralNetworkConfig = NeatConfig['neural_network'];
export const GoalsConfig = NeatConfig['goals'];

// Common parameters for the genetic algorithm
export const totalPopulation = NeatConfig['population'];
export const totalGenerations = NeatConfig['generations'];
export const initialCapital = NeatConfig['initial_capital'];
export const startDateTraining = NeatConfig['start_date_training'];
export const endDateTraining = NeatConfig['end_date_training'];
export const startDateTest = NeatConfig['start_date_test'];
export const endDateTest = NeatConfig['end_date_test'];

// Goals to reach
export const winRate = GoalsConfig['win_rate'];
export const profitFactor = GoalsConfig['profit_factor'];
export const maxRelativeDrawdown = GoalsConfig['max_relative_drawdown'];
export const minimumTrades = GoalsConfig['minimum_trades'];

export const NEURAL_NETWORK_INPUTS = 41;

export const NEURAL_NETWORK_OUTPUTS = 2; // Buy / Sell

export const CANDLE_MIN_LENGTH = 210; // the trader start to trade when it can see X candles
