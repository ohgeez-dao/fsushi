import { ethers } from "hardhat";
import { expect } from "chai";
import { StakedLPTokenFactory, StakedLPToken } from "../typechain-types";
import setupTokens from "./utils/setupTokens";
import setupSushiswap from "./utils/setupSushiswap";

const setupTest = async () => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);

    const Factory = await ethers.getContractFactory("StakedLPTokenFactory");
    const factory = (await Factory.deploy(sushi.chef.address)) as StakedLPTokenFactory;

    return {
        tokens,
        sushi,
        factory,
    };
};

describe("StakedLPTokenFactory", function () {
    it("should create StakedLPToken", async function () {
        const { tokens, sushi, factory } = await setupTest();

        await sushi.factory.createPair(tokens.sushi.address, tokens.weth.address);
        const lpToken = await sushi.factory.getPair(tokens.sushi.address, tokens.weth.address);
        await sushi.chef.add(100, lpToken, false);

        await factory.createStakedLPToken(0);
        const tokenAddress = await factory.predictStakedLPTokenAddress(0);
        expect(await factory.tokens(0)).to.hexEqual(tokenAddress);
        await expect(factory.createStakedLPToken(0)).to.revertedWithCustomError(factory, "TokenCreated");

        const StakedLPToken = await ethers.getContractFactory("StakedLPToken");
        const token = StakedLPToken.attach(tokenAddress) as StakedLPToken;

        expect(await token.factory()).to.be.equal(factory.address);
        expect(await token.pid()).to.be.equal(0);
        expect(await token.lpToken()).to.be.equal(lpToken);
    });
});
