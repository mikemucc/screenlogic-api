"use strict";
const baseSchedId = 700;

function predictSchedId(currentSchedIds) {
  var numSchedules = currentSchedIds.size;
  console.log("Total Current Schedules: " + numSchedules);
  if (numSchedules == 0) {
    return baseSchedId;
  }
  var expectedLargest = numSchedules + baseSchedId;
  var i;
  for (i = baseSchedId; i <= expectedLargest; i++) {
    console.log(i);
    if (!currentSchedIds.has(i)) {
      return i;
    }
  }
  return expectedLargest + 1;
}

exports.predictSchedId = predictSchedId;
