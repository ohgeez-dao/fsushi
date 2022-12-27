import { ethers } from "hardhat";
import { expect } from "chai";
import { FarmingLPTokenFactory, FarmingLPToken, SushiBarVault } from "../typechain-types";
import setupTokens from "./utils/setupTokens";
import setupSushiswap from "./utils/setupSushiswap";

const setupTest = async () => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);

    const Vault = await ethers.getContractFactory("SushiBarVault");
    const vault = (await Vault.deploy(tokens.sushi.address, sushi.bar.address)) as SushiBarVault;

    const Factory = await ethers.getContractFactory("FarmingLPTokenFactory");
    const factory = (await Factory.deploy(
        sushi.router.address,
        sushi.chef.address,
        vault.address
    )) as FarmingLPTokenFactory;

    return {
        tokens,
        sushi,
        factory,
    };
};

describe("FarmingLPTokenFactory", function () {
    it("should create FarmingLPToken", async function () {
        const { tokens, sushi, factory } = await setupTest();

        const pid = 0;
        await sushi.factory.createPair(tokens.sushi.address, tokens.weth.address);
        const lpToken = await sushi.factory.getPair(tokens.sushi.address, tokens.weth.address);
        await sushi.chef.add(100, lpToken, false);

        const tokenAddress = await factory.predictFarmingLPTokenAddress(pid);
        await expect(factory.createFarmingLPToken(pid))
            .to.emit(factory, "CreateFarmingLPToken")
            .withArgs(pid, tokenAddress);

        expect(await factory.getFarmingLPToken(pid)).to.hexEqual(tokenAddress);
        await expect(factory.createFarmingLPToken(pid)).to.revertedWithCustomError(factory, "TokenCreated");

        const FarmingLPToken = await ethers.getContractFactory("FarmingLPToken");
        const token = FarmingLPToken.attach(tokenAddress) as FarmingLPToken;

        expect(await token.factory()).to.be.equal(factory.address);
        expect(await token.pid()).to.be.equal(pid);
        expect(await token.lpToken()).to.be.equal(lpToken);
    });
});
