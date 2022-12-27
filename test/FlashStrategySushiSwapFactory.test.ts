import { ethers } from "hardhat";
import { constants } from "ethers";
import { expect } from "chai";
import {
    FarmingLPTokenFactory,
    FarmingLPToken__factory,
    FlashFToken__factory,
    SushiBarVault,
    FlashStrategySushiSwapFactory,
    FlashStrategySushiSwap__factory,
    FeeVault,
} from "../typechain-types";
import setupSushiswap from "./utils/setupSushiswap";
import setupTokens from "./utils/setupTokens";
import setupFlashStake from "./utils/setupFlashStake";

const setupTest = async feeRecipient => {
    const tokens = await setupTokens();
    const sushi = await setupSushiswap(tokens);
    const flash = await setupFlashStake();
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const SBVault = await ethers.getContractFactory("SushiBarVault");
    const sbVault = (await SBVault.deploy(tokens.sushi.address, sushi.bar.address)) as SushiBarVault;

    const FLPFactory = await ethers.getContractFactory("FarmingLPTokenFactory");
    const flpFactory = (await FLPFactory.deploy(
        sushi.router.address,
        sushi.chef.address,
        sbVault.address
    )) as FarmingLPTokenFactory;

    const Factory = await ethers.getContractFactory("FlashStrategySushiSwapFactory");
    const factory = (await Factory.deploy(
        flash.protocol.address,
        flpFactory.address,
        feeRecipient.address
    )) as FlashStrategySushiSwapFactory;

    return {
        deployer,
        alice,
        bob,
        carol,
        tokens,
        sushi,
        sbVault,
        flpFactory,
        flash,
        factory,
    };
};

describe("FlashStrategySushiSwapFactory", function () {
    it("should create FlashStrategySushiSwap when flpToken exists", async function () {
        const Vault = await ethers.getContractFactory("FeeVault");
        const feeVault = (await Vault.deploy()) as FeeVault;

        const { tokens, sushi, flpFactory, flash, factory } = await setupTest(feeVault);

        const { pid } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
        await flpFactory.createFarmingLPToken(pid);

        const address = await factory.predictFlashStrategySushiSwapAddress(pid);
        await expect(factory.createFlashStrategySushiSwap(pid)).to.emit(factory, "CreateFlashStrategySushiSwap");

        const strategy = FlashStrategySushiSwap__factory.connect(
            await factory.getFlashStrategySushiSwap(pid),
            ethers.provider
        );
        expect(strategy.address).to.be.equal(address);

        await expect(factory.createFlashStrategySushiSwap(pid)).to.be.revertedWithCustomError(
            factory,
            "FlashStrategySushiSwapCreated"
        );

        const flpToken = FarmingLPToken__factory.connect(await strategy.flpToken(), ethers.provider);
        const fTokenName = "FlashStrategySushiSwap " + (await flpToken.name());
        const fTokenSymbol = "f" + (await flpToken.symbol()) + "-" + flpToken.address.substring(2, 6);
        await expect(
            flash.protocol.registerStrategy(strategy.address, flpToken.address, fTokenName, fTokenSymbol)
        ).to.emit(flash.protocol, "StrategyRegistered");

        const fToken = FlashFToken__factory.connect(await strategy.fToken(), ethers.provider);
        expect(await fToken.name()).to.be.equal(fTokenName);
        expect(await fToken.symbol()).to.be.equal(fTokenSymbol);
    });

    it("should create FlashStrategySushiSwap when flpToken doesn't exist", async function () {
        const Vault = await ethers.getContractFactory("FeeVault");
        const feeVault = (await Vault.deploy()) as FeeVault;

        const { tokens, sushi, flpFactory, flash, factory } = await setupTest(feeVault);

        const { pid } = await sushi.addPool(tokens.sushi, tokens.weth, 100);
        expect(await flpFactory.getFarmingLPToken(pid)).to.be.equal(constants.AddressZero);

        const address = await factory.predictFlashStrategySushiSwapAddress(pid);
        await expect(factory.createFlashStrategySushiSwap(pid)).to.emit(factory, "CreateFlashStrategySushiSwap");

        const strategy = FlashStrategySushiSwap__factory.connect(
            await factory.getFlashStrategySushiSwap(pid),
            ethers.provider
        );
        expect(await flpFactory.getFarmingLPToken(pid)).to.be.equal(await strategy.flpToken());
        expect(strategy.address).to.be.equal(address);

        await expect(factory.createFlashStrategySushiSwap(pid)).to.be.revertedWithCustomError(
            factory,
            "FlashStrategySushiSwapCreated"
        );

        const flpToken = FarmingLPToken__factory.connect(await strategy.flpToken(), ethers.provider);
        const fTokenName = "FlashStrategySushiSwap " + (await flpToken.name());
        const fTokenSymbol = "f" + (await flpToken.symbol()) + "-" + flpToken.address.substring(2, 6);
        expect(
            await flash.protocol.registerStrategy(strategy.address, flpToken.address, fTokenName, fTokenSymbol)
        ).to.emit(flash.protocol, "StrategyRegistered");

        const fToken = FlashFToken__factory.connect(await strategy.fToken(), ethers.provider);
        expect(await fToken.name()).to.be.equal(fTokenName);
        expect(await fToken.symbol()).to.be.equal(fTokenSymbol);
    });
});
