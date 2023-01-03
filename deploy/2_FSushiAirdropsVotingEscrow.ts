const VE = {
    "1": "0x77D3d884FeA1E389150a26D4569b20ebA284A86d",
};

export default async ({ getNamedAccounts, deployments, network }) => {
    const { deploy, get, execute } = deployments;
    const { deployer } = await getNamedAccounts();

    const fSushi = await get("FSushi");

    const { address } = await deploy("FSushiAirdropsVotingEscrow", {
        from: deployer,
        args: [VE[network.config.chainId], fSushi.address],
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
