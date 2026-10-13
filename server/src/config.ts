import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  DATABASE_URL: process.env.DATABASE_URL || '',
  BOT_TOKEN: process.env.BOT_TOKEN || 'test_bot_token_123456:ABCdefGHIjklMNOpqrsTUVwxyz',
  DEV_MOCK: process.env.DEV_MOCK !== 'false',
  NODE_ENV: process.env.NODE_ENV || 'development',
  STARTING_BALANCE_UD: 5000,
  DROP_COST_UD: 500,
};
