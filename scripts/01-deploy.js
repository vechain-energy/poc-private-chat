const hre = require('hardhat')

async function main () {
  // build and deploy the contract
  await hre.run('compile')
  const Messages = await hre.thor.getContractFactory('Messages')
  const { abi } = await hre.artifacts.readArtifact('Messages')
  const messages = await Messages.deploy()

  // archive contract interface and address on the blockchain
  await messages.deployed()
  console.log('Messages deployed to:', messages.address)
  require('fs').writeFileSync('src/contract.json', JSON.stringify({ address: messages.address, abi }, '', 2))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
