import { BotConfig } from '../init';

// ========================== STRATEGY CONFIG  ========================== //

export const StrategyConfig = require('../config.js').default;

// ========================== BOT CONFIG (json file) ========================== //

const NeatConfig = BotConfig['neat'];
export const NeuralNetworkConfig = NeatConfig['neural_network'];
export const CandleInputsConfig = NeuralNetworkConfig['candle_inputs'];
export const GoalsConfig = NeatConfig['goals'];
export const IndicatorInputsConfig = NeuralNetworkConfig['indicator_inputs'];

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
export const profitRatio = GoalsConfig['profit_ratio'];
export const maxRelativeDrawdown = GoalsConfig['max_relative_drawdown'];
export const minimumTrades = GoalsConfig['minimum_trades'];

// Configure the inputs of the neural network
export const NEURAL_NETWORK_INDICATORS_INPUTS = {
  EMA21: IndicatorInputsConfig['EMA21'] || false,
  EMA50: IndicatorInputsConfig['EMA50'] || false,
  EMA100: IndicatorInputsConfig['EMA100'] || false,
  ADX: IndicatorInputsConfig['ADX'] || false,
  AO: IndicatorInputsConfig['AO'] || false,
  CCI: IndicatorInputsConfig['CCI'] || false,
  MFI: IndicatorInputsConfig['MFI'] || false,
  ROC: IndicatorInputsConfig['ROC'] || false,
  RSI: IndicatorInputsConfig['RSI'] || false,
  WILLIAM_R: IndicatorInputsConfig['WILLIAM_R'] || false,
  KIJUN: IndicatorInputsConfig['KIJUN'] || false,
  VOL_OSC: IndicatorInputsConfig['VOL_OSC'] || false,
  PRICE_CHANGE: IndicatorInputsConfig['PRICE_CHANGE'] || false,
  VOL: IndicatorInputsConfig['VOL'] || false,
  CANDLE_OPEN: IndicatorInputsConfig['CANDLE_OPEN'] || false,
  CANDLE_HIGH: IndicatorInputsConfig['CANDLE_HIGH'] || false,
  CANDLE_LOW: IndicatorInputsConfig['CANDLE_LOW'] || false,
  CANDLE_CLOSE: IndicatorInputsConfig['CANDLE_CLOSE'] || false,
};

export const NEURAL_NETWORK_INPUTS = Object.entries(
  NEURAL_NETWORK_INDICATORS_INPUTS
).filter(([, val]) => val === true).length;

export const NEURAL_NETWORK_OUTPUTS = 2; // Buy / Sell

export const CANDLE_MIN_LENGTH = 150; // the trader start to trade when it can see X candles
