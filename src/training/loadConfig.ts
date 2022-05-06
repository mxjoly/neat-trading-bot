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
export const goalWinRate = GoalsConfig['win_rate'];
export const goalProfitFactor = GoalsConfig['profit_factor'];
export const goalMaxRelativeDrawdown = GoalsConfig['max_relative_drawdown'];
export const goalNumberTrades = GoalsConfig['number_trades'];
export const goalDailyProfit = GoalsConfig['daily_profit'];
export const goalMonthlyProfit = GoalsConfig['monthly_profit'];

export const NEURAL_NETWORK_INPUTS = 82;

export const NEURAL_NETWORK_OUTPUTS = 3; // Buy / Sell / Wait
