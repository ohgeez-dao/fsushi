export default async ({ getNamedAccounts, deployments }) => {
    const { deploy, get, execute } = deployments;
    const { deployer } = await getNamedAccounts();

    const fSushi = await get("FSushi");

    await deploy("FSushiAirdrops", {
        from: deployer,
        args: [fSushi.address],
        log: true,
    });
    await execute(
        "FSushiAirdrops",
        {
            from: deployer,
            log: true,
        },
        "updateSigner",
        deployer
    );
};
