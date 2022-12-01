import { ethers } from "hardhat";
import { expect } from "chai";
import { StakedLPTokenFactory, StakedLPToken } from "../typechain-types";
import setupSushiswap from "./utils/setupSushiswap";

const setupTest = async () => {
    const sushi = await setupSushiswap();

    const Factory = await ethers.getContractFactory("StakedLPTokenFactory");
    const factory = (await Factory.deploy(sushi.chef.address)) as StakedLPTokenFactory;

    return {
        sushi,
        factory,
    };
};

describe("StakedLPTokenFactory", function () {
    it("should create StakedLPToken", async function () {
        const { sushi, factory } = await setupTest();

        const tx = await sushi.factory.createPair(sushi.sushi.address, sushi.weth.address);
        const receipt = await tx.wait();
        const lpToken = await sushi.factory.getPair(sushi.sushi.address, sushi.weth.address);
        await sushi.chef.add(100, lpToken, false);

        await factory.createStakedLPToken(0);
        const tokenAddress = await factory.predictStakedLPTokenAddress(0);
        expect(await factory.tokens(0)).to.hexEqual(tokenAddress);
        await expect(factory.createStakedLPToken(0)).to.revertedWithCustomError(factory, "TokenCreated");

        const StakedLPToken = await ethers.getContractFactory("StakedLPToken");
        const token = StakedLPToken.attach(tokenAddress) as StakedLPToken;

        expect(await token.name()).to.be.equal("Staked LP Token (SushiToken-Wrapped Ether)");
        expect(await token.symbol()).to.be.equal("SLP:SUSHI-WETH");
    });
});
