export default async ({ getNamedAccounts, deployments }) => {
    const { deploy, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const factory = await get("FlashStrategySushiSwapFactory");
    const sousChef = await get("SousChef");

    await deploy("FSushiCookV0", {
        from: deployer,
        args: [factory.address, sousChef.address],
        log: true,
    });
};
