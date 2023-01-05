export default async ({ getNamedAccounts, deployments }) => {
    const { deploy, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const factory = await get("FlashStrategySushiSwapFactory");

    await deploy("FSushiKitchen", {
        from: deployer,
        args: [factory.address],
        log: true,
    });
};
