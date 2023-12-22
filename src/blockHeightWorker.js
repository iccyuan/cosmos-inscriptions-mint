import { parentPort } from "worker_threads";
import { getAccount } from "../src/getAccount.js";
import { getAccountsFromFile } from "../src/getAccountsFromFile.js";
import { logger } from "../src/logger.js";


import {
    SLEEP_ON_GET_HEIGHT_SEC, MEMO, SLEEP_ON_GET_HEIGHT_ERROR_SEC
} from "../config.js";

export async function fetchBlockHeight(/** @type {string} */ mnemonic) {
    const account = await getAccount(mnemonic);
    while (true) {
        try {
            const blockNumber = await account.signingClient.getHeight();
            logger.info(`[Worker] block height - ${blockNumber}`);
            parentPort.postMessage({ type: 'height', height: blockNumber });
        } catch (err) {
            parentPort.postMessage({ type: 'error', error: err.message });
            await new Promise(resolve => setTimeout(resolve, SLEEP_ON_GET_HEIGHT_ERROR_SEC * 1000));
        }
        await new Promise(resolve => setTimeout(resolve, SLEEP_ON_GET_HEIGHT_SEC * 1000));
    }
}


const accounts = getAccountsFromFile();
try {
    fetchBlockHeight(accounts[0].mnemonic);
} catch (err) {
    logger.error(`[Worker] fetch block height error - ${err.message}`);
}
