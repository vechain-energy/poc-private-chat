import Connex from '@vechain/connex'
import { Transaction, secp256k1 } from 'thor-devkit'
import { message, Typography } from 'antd'
import bent from 'bent'

const NETWORK_URL = process.env.NETWORK_URL || 'https://testnet.veblocks.net'
const EXPLORER_URL = process.env.EXPLORER_URL || 'https://explore-testnet.vechain.org'
const DELEGATE_URL = process.env.DELEGATE_URL || 'https://sponsor-testnet.vechain.energy/by/90'

const connex = new Connex({
  node: NETWORK_URL,
  network: 'test'
})

export async function sendTransactionWithWallet (clauses, wallet) {
  const post = bent('POST', 'json')
  const transaction = new Transaction({
    chainTag: Number.parseInt(connex.thor.genesis.id.slice(-2), 16),
    blockRef: connex.thor.status.head.id.slice(0, 18),
    expiration: 32,
    clauses,
    gas: connex.thor.genesis.gasLimit,
    gasPriceCoef: 128,
    dependsOn: null,
    nonce: +new Date(),
    reserved: {
      features: 1 // this enables the fee delegation feature
    }
  })

  // build hex encoded version of the transaction for signing request
  const rawTransaction = `0x${transaction.encode().toString('hex')}`

  // request to send for sponsorship/fee delegation
  const sponsorRequest = {
    origin: wallet.address,
    raw: rawTransaction
  }

  // request sponsorship
  const { signature, error } = await post(DELEGATE_URL, sponsorRequest)

  // sponsorship was rejected
  if (error) {
    throw new Error(error)
  }

  // sign transaction with the known private key
  const signingHash = transaction.signingHash()
  const originSignature = secp256k1.sign(
    signingHash,
    Buffer.from(wallet.privateKey.slice(2), 'hex')
  )

  // build combined signature from both parties
  const sponsorSignature = Buffer.from(signature.substr(2), 'hex')
  transaction.signature = Buffer.concat([originSignature, sponsorSignature])

  // post transaction to node
  const signedTransaction = `0x${transaction.encode().toString('hex')}`
  const { id } = await post(`${NETWORK_URL}/transactions`, { raw: signedTransaction })

  return id
}

export async function waitForTransactionId (id) {
  message.loading(<>waiting for transaction <Typography.Link href={`${EXPLORER_URL}/transactions/${id}`} rel='noreferrer' target='_blank'>{id.slice(0, 4)}…{id.slice(-4)}</Typography.Link></>, 10)
  const transaction = connex.thor.transaction(id)
  let receipt
  do {
    await connex.thor.ticker().next()
    receipt = await transaction.getReceipt()
  } while (!receipt)

  if (receipt.reverted) {
    const transactionData = await transaction.get()
    const explainedTransaction = await connex.thor.explain(transactionData.clauses)
      .caller(transactionData.origin)
      .execute()

    const revertReasons = explainedTransaction.map(({ revertReason }) => revertReason).join(' ,')

    message.error(revertReasons || 'Transaction was reverted')
    throw new Error(revertReasons || 'Transaction was reverted')
  }
  message.success('transaction successful')

  return transaction
}

export async function getPublicKeyForSenderOfTransactionId (txId) {
  // get raw transaction
  const getRawTransaction = bent(`${NETWORK_URL}/transactions`, 'GET', 'json')
  const { raw } = await getRawTransaction(`/${txId}?raw=true`)

  // build transaction instance for easier handling
  const transaction = Transaction.decode(raw)

  // extract hash and signature(s)
  const hash = transaction.signingHash()
  const signatures = transaction.signature.toString('hex').match(/(.{1,130})/g)

  // recover public key using hash & signature(s)
  return signatures.map(signature => secp256k1.recover(Buffer.from(hash, 'hex'), Buffer.from(signature, 'hex')).toString('hex').slice(2))
}
