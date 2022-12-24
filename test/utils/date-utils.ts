import { time } from "@nomicfoundation/hardhat-network-helpers";

export const WEEK = 60 * 60 * 24 * 7;

export const toWeekNumber = (timestamp: number) => Math.floor(timestamp / WEEK);

export const toTimestamp = (weekNumber: number) => Math.floor(weekNumber) * WEEK;

export const mineAtWeekStart = async (week: number) => await time.increaseTo(toTimestamp(week));
