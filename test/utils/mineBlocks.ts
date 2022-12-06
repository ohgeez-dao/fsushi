import { network } from "hardhat";
import { BigNumber } from "ethers";

const mineBlocks = async (blocks?: number) =>
    await network.provider.send(
        "hardhat_mine",
        blocks ? [BigNumber.from(blocks).toHexString().replace("0x0", "0x")] : undefined
    );
export default mineBlocks;
