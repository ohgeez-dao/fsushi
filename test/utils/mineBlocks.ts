import { mine } from "@nomicfoundation/hardhat-network-helpers";

const mineBlocks = async (blocks?: number, interval?: number) => {
    await mine(blocks, { interval });
};
export default mineBlocks;
