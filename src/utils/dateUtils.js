const { format, parseISO, isValid, isFuture, utcToZonedTime, zonedTimeToUtc } = require("date-fns-tz");

const toUTC = (localDateTime, timeZone = "UTC") => {
  try {
    const date = parseISO(localDateTime);
    if (!isValid(date)) {
      return null;
    }
    return zonedTimeToUtc(date, timeZone);
  } catch (error) {
    return null;
  }
};

const fromUTC = (utcDateTime, timeZone = "UTC") => {
  try {
    const date = parseISO(utcDateTime);
    if (!isValid(date)) {
      return null;
    }
    return utcToZonedTime(date, timeZone);
  } catch (error) {
    return null;
  }
};

const isValidISODateTime = (dateString) => {
  try {
    const date = parseISO(dateString);
    return isValid(date);
  } catch (error) {
    return false;
  }
};

const isNotFuture = (dateString, timeZone = "UTC") => {
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) {
      return false;
    }
    const now = new Date();
    const zonedNow = utcToZonedTime(now, timeZone);
    return !isFuture(date, zonedNow);
  } catch (error) {
    return false;
  }
};

const formatISO = (date) => {
  return date.toISOString();
};

const generateTimestamp = () => {
  return Date.now();
};

module.exports = {
  toUTC,
  fromUTC,
  isValidISODateTime,
  isNotFuture,
  formatISO,
  generateTimestamp,
};