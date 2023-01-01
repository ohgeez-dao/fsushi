// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { deployments, getNamedAccounts } from "hardhat";
import prompts from "prompts";

async function main() {
    const { execute } = deployments;
    const { deployer } = await getNamedAccounts();

    const { name } = await prompts({
        type: "text",
        name: "name",
        message: "Name of new airdrop",
    });

    const { events } = await execute("FSushiAirdrops", { from: deployer, log: true }, "addAirdrop", name);
    for (const event of events) {
        console.log(event.event + " (" + event.args.join(", ") + ")");
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
