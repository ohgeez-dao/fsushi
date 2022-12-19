import { ethers } from "hardhat";

const now = async () => {
    const { timestamp } = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
    return timestamp;
};

export default now;
