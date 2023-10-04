"use strict";
import config from "./config/config.js";
import out from "js-console-log-colors"; // custom context colors for console logging by jasbanza
import executePeriodically from "execute-periodically"; // used for continuous polling

import { qPool } from "./functions/queries.js";

const previousTickValues = {};
const DEBUG_MODE = true;
const SEND_TG_MSG = true;
const POLLING_INTERVAL_MS = 10 * 1000;

(async () => {
  for (const {
    poolId,
    threshold,
    poolFriendlyName,
  } of config.POOL_RANGE_TICK_THRESHOLDS) {
    monitorPool({ poolId, threshold, poolFriendlyName });
    // pause to offset polling

    const phaseOffsetMS = Math.round(
      POLLING_INTERVAL_MS / config.POOL_RANGE_TICK_THRESHOLDS.length
    );
    await new Promise((resolve) => setTimeout(resolve, phaseOffsetMS));
  }
})();

function monitorPool({ poolId, threshold, poolFriendlyName }) {
  const msg = `Monitoring started: Pool #${poolId} (${poolFriendlyName}) [threshold = ${threshold}]`;
  out.command(msg);
  if (SEND_TG_MSG) {
    doTelegramNotification(msg);
  }

  executePeriodically({
    debug: false,
    intervalMS: POLLING_INTERVAL_MS,
    fn: qPool,
    args: [poolId],
    cbSuccess: (res) => {
      const current_tick = parseInt(res.current_tick);
      const tick_spacing = parseInt(res.tick_spacing);

      // Check if the previous tick value is defined for this pool
      if (previousTickValues[poolId] !== undefined) {
        // Calculate the difference between the current tick and the previous tick
        const tickChange = Math.abs(current_tick - previousTickValues[poolId]);

        if (tickChange > 0) {
          if (tickChange > tick_spacing) {
            out.debug(
              `#### New Tick Range > Pool ${poolId} (${poolFriendlyName}) | tick: ${res.current_tick}| threshold: ${threshold}`
            );
          } else {
            out.info(
              `#### Tick Change > Pool ${poolId} | tick: ${res.current_tick}| threshold: ${threshold}`
            );
          }
        }

        // const { nearThreshold, upper_tick, lower_tick } = checkRange({
        //   tick_spacing,
        //   current_tick,
        //   threshold,
        // });

        const test = checkRange({
          tick_spacing: 100,
          current_tick: -14673411,
          threshold: 2,
        });

        if (tickChange > tick_spacing) {
          let msg = `<b>🆕 Pool ${poolId} has a new tick range!</b>\n\n`;
          msg += `• New Range: ${lower_tick} to ${upper_tick}\n`;
          msg += `• Change: ${tickChange} ticks`;

          doTelegramNotification(msg);
        } else if (tickChange > 0 && nearThreshold) {
          let msg = `<b>⚠️ Pool ${poolId} is near threshold:</b>\n\n`;
          msg += `• Range: ${lower_tick} to ${upper_tick}\n\n`;
          msg += `• Current Tick: ${current_tick}\n`;
          msg += `• Alert Threshold: ${threshold}%`;

          doTelegramNotification(msg);
        }
      }

      // Update the previous tick value for this pool
      previousTickValues[poolId] = current_tick;
      if (DEBUG_MODE) {
        console.log(previousTickValues);
      }
    },
  });
}

function checkRange({ tick_spacing, current_tick, threshold }) {
  const positionInRange = tick_spacing + (current_tick % tick_spacing);

  const upper_tick = current_tick - (current_tick % tick_spacing);
  const lower_tick = upper_tick - tick_spacing;

  let nearThreshold = false;
  if (
    positionInRange <= threshold ||
    positionInRange >= tick_spacing - threshold
  ) {
    nearThreshold = true;
  }

  return { nearThreshold, upper_tick, lower_tick };
}

function doTelegramNotification(text = "", attempts = 1) {
  if (!SEND_TG_MSG) {
    return;
  }
  const json_body = {
    chat_id: config.TG_CHAT_ID,
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
      if (DEBUG_MODE) {
        console.log(json);
      }
    })
    .catch((e) => {
      console.log(">>>>> error calling telegram webhook");
      console.log(e);
      if (attempts <= 5) {
        console.log(`retrying attempt ${attempts} of 5 in 3 seconds...`);
        setTimeout(() => {
          doTelegramNotification(text, attempts + 1);
        }, 5000);
      } else {
        console.log(">>>>>>>>>> All attempts failed...");
      }
    });
}
