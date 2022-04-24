import { decimalFloor } from './math';

/**
 * // Calculate the activation price for the trailing stop according tot the trailing stop configuration
 * @param trailingStopConfig
 * @param currentPrice
 * @param pricePrecision
 * @param takeProfit
 */
export const calculateActivationPrice = (
  trailingStopConfig: TrailingStopConfig,
  currentPrice: number,
  pricePrecision: number,
  takeProfit: number
) => {
  let { percentageToTP, changePercentage } = trailingStopConfig.activation;

  if (percentageToTP) {
    let delta = Math.abs(takeProfit - currentPrice);
    return decimalFloor(currentPrice + delta * percentageToTP, pricePrecision);
  } else if (changePercentage) {
    return decimalFloor(currentPrice * (1 + changePercentage), pricePrecision);
  } else {
    return currentPrice;
  }
};
