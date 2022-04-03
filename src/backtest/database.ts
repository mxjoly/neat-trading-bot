import { JsonDB } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig';

/**
 * See the declaration file types.ts to see the scheme of database
 */
export let db: JsonDB;

export const createDatabase = () => {
  db = new JsonDB(new Config(`temp/trace-${Date.now()}`, true, true, '/'));
};

// =================================================================

export const saveFuturesState = (date: string, wallet: FuturesWallet) => {
  setFuturesWallet(date, wallet);
};

// =================================================================

export const setFuturesWallet = (date: string, wallet: FuturesWallet) => {
  db.push(`/${date}/futures_wallet`, wallet, true);
};

export const updateFuturesWalletInfo = (
  date: string,
  data: {
    availableBalance: number;
    totalWalletBalance: number;
    totalUnrealizedProfit: number;
    totalPositionInitialMargin: number;
  }
) => {
  db.push(`/${date}/futures_wallet`, { ...data }, false);
};

export const getFuturesWallet = (date: string): FuturesWallet | null => {
  if (db.exists(`/${date}/futures_wallet`)) {
    return db.getData(`/${date}/futures_wallet`);
  }
};
