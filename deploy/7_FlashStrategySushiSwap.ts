import { constants } from "ethers";

export default async ({ getNamedAccounts, deployments }) => {
    const { deploy, execute } = deployments;
    const { deployer } = await getNamedAccounts();

    await deploy("FlashStrategySushiSwap", {
        from: deployer,
        args: [],
        log: true,
    });
    await execute(
        "FlashStrategySushiSwap",
        {
            from: deployer,
            log: true,
        },
        "initialize",
        constants.AddressZero,
        constants.AddressZero
    );
};
