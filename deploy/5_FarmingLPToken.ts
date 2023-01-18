import { constants } from "ethers";

export default async ({ getNamedAccounts, deployments }) => {
    const { deploy, execute } = deployments;
    const { deployer } = await getNamedAccounts();

    await deploy("FarmingLPToken", {
        from: deployer,
        args: [],
        log: true,
    });
    await execute(
        "FarmingLPToken",
        {
            from: deployer,
            log: true,
        },
        "initialize",
        constants.AddressZero,
        constants.AddressZero,
        0
    );
};
