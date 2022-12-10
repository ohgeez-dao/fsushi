import { ethers } from "hardhat";
import { constants, utils } from "ethers";
import { expect } from "chai";
import {
    StakedLPTokenFactory,
    StakedLPToken,
    StakedLPToken__factory,
    SushiBarStrategy,
    FlashFTokenFactory,
    FlashProtocol,
    FlashNFT,
    FlashMasterChef,
    ERC20__factory,
    FlashFToken__factory,
} from "../typechain-types";
import setupSushiswap from "./utils/setupSushiswap";
import setupTokens from "./utils/setupTokens";

const ONE = ethers.constants.WeiPerEther;
const YEAR = 365 * 24 * 3600;

const setupTest = async (feeBPS, feeRecipient) => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const SLPStrategy = await ethers.getContractFactory("SushiBarStrategy");
    const slpStrategy = (await SLPStrategy.deploy(tokens.sushi.address, sushi.bar.address)) as SushiBarStrategy;

    const SLPFactory = await ethers.getContractFactory("StakedLPTokenFactory");
    const slpFactory = (await SLPFactory.deploy(sushi.chef.address, slpStrategy.address)) as StakedLPTokenFactory;

    const createStakedLPToken = async pid => {
        await slpFactory.createStakedLPToken(pid);
        return StakedLPToken__factory.connect(
            await slpFactory.predictStakedLPTokenAddress(pid),
            ethers.provider
        ) as StakedLPToken;
    };

    // add SUSHI-WETH pool
    const { pid, lpToken } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
    const slpToken = await createStakedLPToken(pid);

    const FlashFactory = await ethers.getContractFactory("FlashFTokenFactory");
    const factory = (await FlashFactory.deploy()) as FlashFTokenFactory;

    const FlashNft = await ethers.getContractFactory("FlashNFT");
    const nft = (await FlashNft.deploy()) as FlashNFT;

    const Protocol = await ethers.getContractFactory("FlashProtocol");
    const protocol = (await Protocol.deploy(nft.address, factory.address)) as FlashProtocol;
    await factory.transferOwnership(protocol.address);

    const FlashMC = await ethers.getContractFactory("FlashMasterChef");
    const strategy = (await FlashMC.deploy(
        protocol.address,
        feeBPS,
        feeRecipient,
        slpFactory.address,
        pid
    )) as FlashMasterChef;

    await protocol.registerStrategy(
        strategy.address,
        slpToken.address,
        "FlashMasterChef " + (await slpToken.name()),
        "f" + (await slpToken.symbol()) + "-" + slpToken.address.substring(2, 6)
    );

    const fToken = FlashFToken__factory.connect(await strategy.fToken(), ethers.provider);

    const mintSLP = async (account, amountToken) => {
        if ((await lpToken.totalSupply()).isZero()) {
            amountToken = amountToken.add(1000);
        }
        await tokens.sushi.transfer(account.address, amountToken);
        await tokens.weth.connect(account).deposit({ value: amountToken });
        await sushi.addLiquidity(account, tokens.sushi, tokens.weth, amountToken, amountToken);

        const amountLP = await lpToken.balanceOf(account.address);
        await lpToken.connect(account).approve(slpToken.address, constants.MaxUint256);
        await slpToken.connect(account).stake(amountLP, account.address);
        return amountLP;
    };

    return {
        deployer,
        alice,
        bob,
        carol,
        tokens,
        sushi,
        slpStrategy,
        slpFactory,
        pid,
        lpToken,
        slpToken,
        factory,
        nft,
        protocol,
        strategy,
        fToken,
        createStakedLPToken,
        mintSLP,
    };
};

describe("FlashMasterChef", function () {
    it("should stake for 1 account", async function () {
        const Vault = await ethers.getContractFactory("FeeVault");
        const vault = await Vault.deploy();

        const { alice, slpToken, protocol, strategy, fToken, mintSLP } = await setupTest(0, vault.address);

        const amount = ONE.mul(100);
        const amountLP = await mintSLP(alice, amount);
        expect(await slpToken.balanceOf(alice.address)).to.be.equal(amountLP);

        await slpToken.connect(alice).approve(protocol.address, constants.MaxUint256);
        await protocol.connect(alice).stake(strategy.address, amountLP, YEAR, alice.address, false);
        expect(await slpToken.balanceOf(alice.address)).to.be.equal(0);
        expect(await slpToken.balanceOf(strategy.address)).to.be.equal(amountLP);
        expect(await fToken.balanceOf(alice.address)).to.be.equal(amountLP);
    });
});
