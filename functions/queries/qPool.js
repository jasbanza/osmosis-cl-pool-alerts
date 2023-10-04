import runOsmosisdCommand from "nodejs-run-osmosisd-command";
import asyncRetryHandler from "async-retry-handler";
import out from "js-console-log-colors"; // Custom context colors for console logging by jasbanza

// Constants for controlling retry behavior:
const MAX_RETRIES = 100; // Maximum number of retries
const MIN_TIMEOUT = 300; // Minimum timeout between retries
const MAX_TIMEOUT = 3000; // Maximum timeout between retries
const MAX_RETRY_TIME = 30 * 1000; // Maximum total retry time (30 seconds)
const DEBUG_MODE = false; // debug this file

/**
 * Retrieves information about a liquidity pool.
 *
 * @param {string} poolId - The ID of the liquidity pool to query.
 * @returns {Promise<Object>} A Promise that resolves with an object representing the pool information.
 * @throws {Error} If there's an error while retrieving the pool information.
 */
const qPool = async (poolId) => {
  try {
    // Use the asyncRetryHandler function to perform the operation with retry logic
    const response = await asyncRetryHandler({
      operationFunction: runOsmosisdCommand,
      operationFunctionArgs: [`osmosisd q poolmanager pool ${poolId}`],
      maxRetries: MAX_RETRIES,
      minTimeout: MIN_TIMEOUT,
      maxTimeout: MAX_TIMEOUT,
      maxRetryTime: MAX_RETRY_TIME,
      successCriteria,
      parseResult,
      onSuccess,
      onFailure,
      debug: DEBUG_MODE,
    });

    /**
     * Define the success criteria for the pool query operation.
     *
     * @param {Object} response - The response from the operation.
     * @returns {boolean} True if the operation was successful, false otherwise.
     */
    function successCriteria(response) {
      if (response && response.stdout) {
        const parsedResponse = JSON.parse(response.stdout);
        // Check if the response is an object with pool information
        if (
          parsedResponse &&
          typeof parsedResponse === "object" &&
          parsedResponse.pool
        ) {
          return true;
        }
      }
      return false;
    }

    /**
     * Parse the result of the pool query operation.
     *
     * @param {Object} response - The response from the operation.
     * @returns {Object} An object representing the pool information.
     */
    function parseResult(response) {
      const parsedResponse = JSON.parse(response.stdout).pool;
      return parsedResponse;
    }

    /**
     * Handle the onSuccess callback when the operation is successful.
     *
     * @param {Object} response - The response from the operation.
     */
    function onSuccess(response) {
      if (DEBUG_MODE) {
        out.info(`Pool #${poolId}:`);
      }
      // Handle success here if needed
    }

    /**
     * Handle the onFailure callback when the operation fails.
     *
     * @param {Error} error - The error object representing the failure.
     */
    function onFailure(error) {
      out.error("qPool operation failed:", error);
      // Handle failure here if needed
    }

    return response;
  } catch (error) {
    // Handle any errors that occur during the retrieval
    throw new Error(
      `Error while retrieving pool information for pool ID ${poolId}: ${error.message}`
    );
  }
};

export default qPool;
