export default async ({ getNamedAccounts, deployments }) => {
    const { deploy, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const fSushi = await get("FSushi");
    const fSushiBar = await get("FSushiBar");
    const fSushiKitchen = await get("FSushiKitchen");
    const factory = await get("FlashStrategySushiSwapFactory");

    await deploy("FSushiKitchen", {
        from: deployer,
        args: [fSushi.address, fSushiBar.address, fSushiKitchen.address, factory.address],
        log: true,
    });
};
