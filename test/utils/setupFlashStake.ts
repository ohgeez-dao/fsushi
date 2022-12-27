import { ethers } from "hardhat";
import { FlashFTokenFactory, FlashNFT, FlashProtocol } from "../../typechain-types";

const setupFlashStake = async () => {
    const FlashFactory = await ethers.getContractFactory("FlashFTokenFactory");
    const factory = (await FlashFactory.deploy()) as FlashFTokenFactory;

    const FlashNft = await ethers.getContractFactory("FlashNFT");
    const nft = (await FlashNft.deploy()) as FlashNFT;

    const Protocol = await ethers.getContractFactory("FlashProtocol");
    const protocol = (await Protocol.deploy(nft.address, factory.address)) as FlashProtocol;
    await factory.transferOwnership(protocol.address);

    return {
        factory,
        nft,
        protocol,
    };
};
export default setupFlashStake;
