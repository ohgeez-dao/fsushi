export default async ({ getNamedAccounts, deployments }) => {
    const { deploy, get, execute } = deployments;
    const { deployer } = await getNamedAccounts();

    const fSushi = await get("FSushi");
    const fSushiBar = await get("FSushiBar");
    const fSushiKitchen = await get("FSushiKitchen");
    const factory = await get("FlashStrategySushiSwapFactory");

    const { address } = await deploy("SousChef", {
        from: deployer,
        args: [fSushi.address, fSushiBar.address, fSushiKitchen.address, factory.address],
        log: true,
    });
    await execute(
        "FSushi",
        {
            from: deployer,
            log: true,
        },
        "setMinter",
        address,
        true
    );
};
