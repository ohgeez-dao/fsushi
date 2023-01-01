export default async ({ getNamedAccounts, deployments }) => {
    const { deploy, get, execute } = deployments;
    const { deployer } = await getNamedAccounts();

    const fSushi = await get("FSushi");

    await deploy("FSushiAirdrops", {
        from: deployer,
        args: [fSushi.address],
        log: true,
    });
    const { address } = await execute(
        "FSushiAirdrops",
        {
            from: deployer,
            log: true,
        },
        "updateSigner",
        deployer
    );
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
