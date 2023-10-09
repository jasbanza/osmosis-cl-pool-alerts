"use strict";
import config from "./config/config.js";
import out from "js-console-log-colors"; // custom context colors for console logging by jasbanza
import executePeriodically from "execute-periodically"; // used for continuous polling
import fetch from "node-fetch"; // used for fetching data from the LCD endpoint
let previousTickValues = {};

(async () => {
  for (const {
    poolId,
    threshold,
    poolFriendlyName,
    telegramChatId
  } of config.POOL_RANGE_TICK_THRESHOLDS) {
    monitorPool({ poolId, threshold, poolFriendlyName, telegramChatId });
    // pause to offset polling

    const phaseOffsetMS = Math.round(
      config.POLLING_INTERVAL_MS / config.POOL_RANGE_TICK_THRESHOLDS.length
    );
    await new Promise((resolve) => setTimeout(resolve, phaseOffsetMS));
  }
})();

/**
 * Monitors a pool and checks if the current tick is within a certain threshold of the upper or lower tick.
 * @param {Object} params - The parameters for the function.
 * @param {number} params.poolId - The ID of the pool to monitor.
 * @param {number} params.threshold - The threshold for the tick.
 * @param {string} params.poolFriendlyName - The friendly name of the pool.
 */
function monitorPool({ poolId, threshold, poolFriendlyName, telegramChatId }) {
  let text = `Monitoring started: Pool #${poolId} (${poolFriendlyName}) [threshold = ${threshold}]`;
  out.command(text);
  if (config.SEND_TG_BOTSTART_text) {
    doTelegramNotification({ text: text, chatId: telegramChatId });
  }

  executePeriodically({
    debug: false,
    intervalMS: config.POLLING_INTERVAL_MS,
    fn: getPool,
    args: [poolId],
    cbSuccess: (res) => {
      try {

        const current_tick = parseInt(res.current_tick);
        const tick_spacing = parseInt(res.tick_spacing);


        // Check if the previous tick value is defined for this pool
        if (previousTickValues[poolId] !== undefined) {
          // Calculate the difference between the current tick and the previous tick
          const tickChange = current_tick - previousTickValues[poolId];
          const absTickChange = Math.abs(tickChange);
          const numTickRangeChanges = getNumRangeChanges({
            tickA: current_tick,
            tickB: previousTickValues[poolId],
            tick_spacing,
          });

          const { nearThreshold, nearUpperOrLower, upperTick, lowerTick } =
            checkRange({
              tick_spacing,
              current_tick,
              threshold,
            });
          if (numTickRangeChanges > 1) {
            let text = `<b>🆕 Pool ${poolId} has a new tick range!</b>\n\n`;
            text += `• Current Tick: ${current_tick}\n`;
            text += `• New Range: ${lowerTick} to ${upperTick}\n`;
            text += `• Change: ${tickChange > 0 ? " 📈 +" + tickChange : " 📉 " + tickChange
              } ticks\n`;
            text += `• Change: ${numTickRangeChanges} tick ranges`;

            doTelegramNotification({ text: text, chatId: telegramChatId });
            if (config.DEBUG_MODE) {
              out.debug(text);
            }
          } else if (absTickChange > 0 && nearThreshold) {
            let text = `<b>⚠️ Pool ${poolId} is near ${nearUpperOrLower} threshold:</b>\n\n`;
            text += `• Range: ${lowerTick} to ${upperTick}\n\n`;
            text += `• Current Tick: ${current_tick}\n`;
            text += `• Alert Threshold: ${threshold} ticks`;

            doTelegramNotification({ text: text, chatId: telegramChatId });
            if (config.DEBUG_MODE) {
              out.debug(text);
            }
          }
        }
        // Update the previous tick value for this pool
        previousTickValues = { ...previousTickValues, [poolId]: current_tick };
        if (config.DEBUG_MODE) {
          out.debug("previousTickValues:");
          console.log(previousTickValues);
        }

      } catch (error) {
        console.error('Fetch error:', error);
      }
    },
  });
}

async function getPool(poolId) {
  try {
    const response = await fetch(`https://lcd.osmosis.zone/osmosis/poolmanager/v1beta1/pools/${poolId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    // Process the response here
    const data = await response.json();
    return data.pool;
  } catch (error) {
    console.error('Fetch error:', error);
  }
}

/**
 * Checks if the current tick is within a certain threshold of the upper or lower tick.
 * @param {Object} params - The parameters for the function.
 * @param {number} params.tick_spacing - The spacing between ticks.
 * @param {number} params.current_tick - The current tick.
 * @param {number} params.threshold - The threshold for the tick.
 * @returns {Object} An object containing the results of the check.
 */
function checkRange({ tick_spacing, current_tick, threshold }) {
  // Calculate the lower tick by rounding down to the nearest multiple of tick_spacing
  const lowerTick = Math.floor(current_tick / tick_spacing) * tick_spacing;
  // The upper tick is always one tick_spacing above the lower tick
  const upperTick = lowerTick + tick_spacing;
  // Check if the current tick is within the threshold of the upper or lower tick
  let nearUpperOrLower;
  if (current_tick <= lowerTick + threshold) {
    nearUpperOrLower = "lower";
  } else if (current_tick >= upperTick - threshold) {
    nearUpperOrLower = "upper";
  }
  // Check if the current tick is near the threshold of the upper or lower tick
  const nearThreshold = Boolean(nearUpperOrLower);
  // Return the results
  return { nearThreshold, nearUpperOrLower, upperTick, lowerTick };
}

function doTelegramNotification({ text = "", attempts = 1, chatId }) {
  if (!config.SEND_TG_MSG) {
    return;
  }
  const json_body = {
    chat_id: chatId,
    text: text,
  };

  fetch(
    `https://api.telegram.org/bot${config.TG_BOT_KEY}/sendMessage?parse_mode=html`,
    {
      method: "POST",
      body: JSON.stringify(json_body),
      headers: {
        "Content-Type": "application/json",
      },
    }
  )
    .then((res) => res.json())
    .then((json) => {
      if (config.DEBUG_MODE) {
        console.log(json);
      }
    })
    .catch((e) => {
      console.log(">>>>> error calling telegram webhook");
      console.log(e);
      if (attempts <= 5) {
        console.log(`retrying attempt ${attempts} of 5 in 3 seconds...`);
        setTimeout(() => {
          doTelegramNotification({ text, attempts: attempts + 1, chatId });
        }, 5000);
      } else {
        console.log(">>>>>>>>>> All attempts failed...");
      }
    });
}

/**
 * Calculates the number of range changes between two ticks.
 * @param {Object} params - The parameters for the function.
 * @param {number} params.tickA - The first tick.
 * @param {number} params.tickB - The second tick.
 * @param {number} params.tick_spacing - The spacing between ticks.
 * @returns {number} The number of range changes.
 */
function getNumRangeChanges({ tickA, tickB, tick_spacing }) {
  // Calculate the absolute difference
  const difference = Math.abs(tickA - tickB);

  // Calculate the number of increments of tick_spacing needed to reach the target
  const spaces = Math.floor(difference / tick_spacing);

  return spaces;
}

/**
 * Checks if two objects are equal.
 * @param {Object} objA - The first object.
 * @param {Object} objB - The second object.
 * @returns {boolean} True if the objects are equal, false otherwise.
 */
function objectsAreEqual(objA, objB) {
  return JSON.stringify(objA) === JSON.stringify(objB);
}
