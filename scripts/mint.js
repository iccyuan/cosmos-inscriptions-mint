import {
  BLOCK_HEIGHTS,
  EXPLORER, FEE_NATIVE, GAS, MAX_MINT_COUNT,
  MEMO,
  MINT_AMOUNT_NATIVE, MINT_COUNT,
  NATIVE_TICK,
  SLEEP_BETWEEN_ACCOUNT_TXS_SEC,
  SLEEP_ON_GET_ACCOUNT_ERROR_SEC,
  UNATIVE_PER_NATIVE,
  SLEEP_ON_GET_HEIGHT_SEC,
} from "../config.js";
import { sleep } from "../src/helpers.js";
import { logger } from "../src/logger.js";
import { getAccount } from "../src/getAccount.js";
import { getAccountsFromFile } from "../src/getAccountsFromFile.js";
import { sendTokens } from "../src/sendTokens.js";
import { Worker } from 'worker_threads';
import path from 'path';

const workerPath = path.join(process.cwd(), 'src/blockHeightWorker.js');
const blockHeightWorker = new Worker(workerPath);
// 标识mint状态
let isMint = false

blockHeightWorker.on('message', (message) => {
  if (message.type === 'height') {
    const blockNumber = message.blockNumber;
    let flag = false;
    for (let i = 0; i < BLOCK_HEIGHTS.length; i++) {
      let startHeight = BLOCK_HEIGHTS[i][0]
      let endHeight = BLOCK_HEIGHTS[i][1]
      if (blockNumber >= startHeight && blockNumber <= endHeight) {
        flag = true;
        break
      }
    }
    if (isMint && !flag) {
      logger.info('end...');
    }
    isMint = flag;
  } else if (message.type === 'error') {
    logger.error(`get block height error - ${message.error}`);
  }
});

export const sendTx = async (
  /** @type {number} */ accountIdx,
  /** @type {string} */ address,
  signingClient,
  InjPrivateKey
) => {
  logger.warn(`[${accountIdx}] ${address} - start sending tx`);
  const amount = Math.round(MINT_AMOUNT_NATIVE * UNATIVE_PER_NATIVE).toString()

  const { transactionHash } = await sendTokens({
    signingClient,
    privateKey: InjPrivateKey,
    fromAddress: address,
    toAddress: address,
    memo: MEMO,
    amount: amount,
  });

  const txUrl = `${EXPLORER}/${transactionHash}`;

  logger.info(`[${accountIdx}] ${address} success hash - ${txUrl}`);
};

const getAccountWrapped = async (
  /** @type {number} */ accountIdx,
  /** @type {string} */ mnemonic
) => {
  while (true) {
    try {
      return await getAccount(mnemonic);
    } catch (error) {
      logger.error(`[${accountIdx}] init error - ${error.message}`);
      await sleep(SLEEP_ON_GET_ACCOUNT_ERROR_SEC);
    }
  }
};


const processAccount = async (
  /** @type {number} */ accountIdx,
  /** @type {string} */ mnemonic
) => {
  if (!isMint) {
    return
  }
  const account = await getAccountWrapped(accountIdx, mnemonic);
  logger.warn(
    `[${accountIdx}] ${account.address} started - ${account.nativeAmount} ${NATIVE_TICK} ($${account.usdAmount})`
  );

  let mintCount = MINT_COUNT
  if (mintCount <= 0) {
    if (MAX_MINT_COUNT <= 0) {
      mintCount = 10000
    } else {
      mintCount = MAX_MINT_COUNT
    }
  }
  for (let i = 0; i < mintCount; i++) {
    try {
      await sendTx(
        accountIdx,
        account.address,
        account.signingClient,
        account.InjPrivateKey
      );
      await sleep(SLEEP_BETWEEN_ACCOUNT_TXS_SEC);
    } catch (error) {
      logger.error(
        `[${accountIdx}] ${account.address} tx error - ${error.message}`
      );

      if (error?.message?.includes("is smaller than")) {
        logger.warn(
          `[${accountIdx}] ${account.address} remove due to small balance`
        );
        return;
      }

      await sleep(SLEEP_ON_GET_ACCOUNT_ERROR_SEC);
    }
  }
};

const main = async () => {
  const fee = Math.round(FEE_NATIVE * UNATIVE_PER_NATIVE).toString();
  const gas = GAS.toString()
  logger.info(`fee - ${fee}, gas - ${gas}`)
  const accounts = getAccountsFromFile();
  for (let idx = 0; idx < accounts.length; idx += 1) {
    processAccount(idx, accounts[idx].mnemonic);
  }
};


// 条件检查函数
const checkConditionAndRun = () => {
  if (isMint) {
    clearInterval(intervalId); // 停止定时器
    main(); // 条件满足，执行主函数
  }
};

// 设置定时器，定期检查条件,检查时间和获取高度数据关联
const intervalId = setInterval(checkConditionAndRun, (SLEEP_ON_GET_HEIGHT_SEC / 2) * 1000);