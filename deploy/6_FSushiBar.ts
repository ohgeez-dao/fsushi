export default async ({ getNamedAccounts, deployments }) => {
    const { deploy, get } = deployments;
    const { deployer } = await getNamedAccounts();

    const fSushi = await get("FSushi");

    await deploy("FSushiBar", {
        from: deployer,
        args: [fSushi.address],
        log: true,
    });
};
