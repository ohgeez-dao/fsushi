import { ethers } from "hardhat";
import {
    FarmingLPToken__factory,
    FarmingLPTokenFactory,
    FlashFToken__factory,
    FlashStrategySushiSwap__factory,
    FlashStrategySushiSwapFactory,
    SushiBarVault,
} from "../../typechain-types";

const setupPeripherals = async (tokens, sushi, flash, feeRecipient) => {
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

    const createFlashStrategySushiSwap = async (token0, token1, allocPoint) => {
        const { pid, lpToken } = await sushi.addPool(token0, token1, allocPoint);
        await factory.createFlashStrategySushiSwap(pid);

        const strategy = FlashStrategySushiSwap__factory.connect(
            await factory.getFlashStrategySushiSwap(pid),
            ethers.provider
        );
        const flpToken = FarmingLPToken__factory.connect(await strategy.flpToken(), ethers.provider);

        await flash.protocol.registerStrategy(
            strategy.address,
            flpToken.address,
            "FlashStrategySushiSwap " + (await flpToken.name()),
            "f" + (await flpToken.symbol()) + "-" + flpToken.address.substring(2, 6)
        );

        const fToken = FlashFToken__factory.connect(await strategy.fToken(), ethers.provider);

        return {
            pid,
            lpToken,
            flpToken,
            strategy,
            fToken,
        };
    };

    return {
        sbVault,
        flpFactory,
        factory,
        createFlashStrategySushiSwap,
    };
};

export default setupPeripherals;
