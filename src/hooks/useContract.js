import { useCallback } from 'react'
import Connex from '@vechain/connex'
import EthCrypto from 'eth-crypto'
import { sendTransactionWithWallet, waitForTransactionId, getPublicKeyForSenderOfTransactionId } from './helper/transactions'
import { encryptMessageForBy, decryptMessageFor } from './helper/encryption'

const abiByName = {}
const { abi, address: contractAddress } = require('../contract.json')
abi.forEach(fn => { abiByName[fn.name] = fn })

const NETWORK_URL = process.env.NETWORK_URL || 'https://testnet.veblocks.net'

const connex = new Connex({
  node: NETWORK_URL,
  network: 'test'
})

const contract = connex.thor.account(contractAddress)

export function useContract ({ wallet } = {}) {
  const getNameFor = useCallback(async function getNameFor (address) {
    const { decoded: { 0: name } } = await contract.method(abiByName.nameByAddress).call(address)
    return name
  }, [])

  async function setName (newName) {
    const clause = contract.method(abiByName.setName).asClause(newName)
    const txId = await sendTransactionWithWallet([clause], wallet)
    await waitForTransactionId(txId)
  }

  const getMessages = useCallback(async function getMessages () {
    const messages = []

    // get current count of tokens
    const { decoded: { 0: count } } = await contract.method(abiByName.balanceOf).call(wallet.address)

    // loop thru each token and get details
    for (let index = 0; index < count; index++) {
      // get the token id of each owned token
      const { decoded: { 0: tokenId } } = await contract.method(abiByName.tokenOfOwnerByIndex).call(wallet.address, index)

      // read the tokenURI that containts the encrypted message
      const { decoded: { 0: encryptedMessage } } = await contract.method(abiByName.tokenURI).call(tokenId)

      try {
        // decrypt mesage using the local wallets private key
        const { payload, senderAddress } = await decryptMessageFor(encryptedMessage, wallet.privateKey)

        // for user readability, get the "registered" name of the sender
        const senderName = await getNameFor(senderAddress)

        // for debbuging purpose, get transaction id
        const txId = await getTxForMessage(tokenId)

        messages.push({ tokenId, payload, senderAddress, senderName, txId, encryptedMessage })
      } catch (err) {
        console.error(err)
      }
    }

    return messages
  }, [getNameFor, wallet])

  async function getTxForMessage (tokenId) {
    const setNameEvent = contract.event(abiByName.Transfer)
    const [event] = await setNameEvent.filter([{ tokenId }]).order('desc').apply(0, 1)

    if (!event) {
      throw new Error(`No Message found for ${tokenId}`)
    }

    return event.meta.txID
  }

  async function getTransactionIdForAddress (userAddress) {
    const setNameEvent = contract.event(abiByName.SetName)
    const [event] = await setNameEvent.filter([{ userAddress }])
      .apply(0, 1)

    if (!event) {
      throw new Error(`No Registration found for ${userAddress}`)
    }

    return event.meta.txID
  }

  async function sendMessage (to, text) {
    // get public key from recipients previous transactions
    const recipientTxId = await getTransactionIdForAddress(to)
    const [publicKey] = await getPublicKeyForSenderOfTransactionId(recipientTxId)

    // encrypt message for recipient
    const encryptedMessageForRecipient = await encryptMessageForBy(text, publicKey, wallet.privateKey)

    const clauses = []
    clauses.push(contract.method(abiByName.safeMint).asClause(to, encryptedMessageForRecipient))

    // … also send "outgoing" message to allow the sender to read sent message
    if (to !== wallet.address) {
      const encryptedMessageForSender = await encryptMessageForBy(text, EthCrypto.publicKeyByPrivateKey(wallet.privateKey), wallet.privateKey)
      clauses.push(contract.method(abiByName.safeMint).asClause(wallet.address, encryptedMessageForSender))
    }

    // submit transaction
    const txId = await sendTransactionWithWallet(clauses, wallet)
    await waitForTransactionId(txId)
  }

  async function deleteMessage (tokenId) {
    const clause = contract.method(abiByName.burn).asClause(tokenId)
    const txId = await sendTransactionWithWallet([clause], wallet)
    await waitForTransactionId(txId)
  }

  return {
    getNameFor,
    setName,
    getMessages,
    sendMessage,
    deleteMessage
  }
}
