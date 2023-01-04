import { time } from "@nomicfoundation/hardhat-network-helpers";

export const DAY = 60 * 60 * 24;
export const WEEK = 7 * DAY;

export const toWeekNumber = (timestamp: number) => Math.floor(timestamp / WEEK);

export const toTimestamp = (weekNumber: number) => Math.floor(weekNumber) * WEEK;

export const mineAtWeekStart = async (week: number) => await time.increaseTo(toTimestamp(week));
