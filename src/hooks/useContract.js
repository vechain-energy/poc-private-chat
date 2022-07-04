import Connex from "@vechain/connex";
import { Transaction, secp256k1 } from "thor-devkit";
import { message, Typography } from 'antd'
import bent from "bent";
import EthCrypto from 'eth-crypto';

const abiByName = {};
const { abi, address: contractAddress } = require('../contract.json')
abi.forEach(fn => abiByName[fn.name] = fn)

const NETWORK_URL = "https://testnet.veblocks.net"
const EXPLORER_URL = "https://explore-testnet.vechain.org"
const DELEGATE_URL = "https://sponsor-testnet.vechain.energy/by/90"

const connex = new Connex({
  node: NETWORK_URL,
  network: "test"
});

export function useContract({ wallet } = {}) {
  async function getNameFor(address) {
    const { decoded } = await connex.thor.account(contractAddress).method(abiByName.getNameFor).call(address)
    return decoded.name
  }

  async function setName(newName) {
    const clause = await connex.thor.account(contractAddress).method(abiByName.setName).asClause(newName)
    const txId = await signTransactionWithPrivateKey([clause])
    await waitForTransactionId(txId)
  }

  async function getMessagesFor(address) {
    const messages = []
    const { decoded: { '0': count } } = await connex.thor.account(contractAddress).method(abiByName.balanceOf).call(address)
    for (let index = 0; index < count; index++) {
      const { decoded: { '0': tokenId } } = await connex.thor.account(contractAddress).method(abiByName.tokenOfOwnerByIndex).call(address, index)
      const { decoded: { '0': encryptedMessage } } = await connex.thor.account(contractAddress).method(abiByName.tokenURI).call(tokenId)
      try {
        const { payload, senderAddress } = await decryptMessageFor(encryptedMessage, wallet.privateKey)
        const senderName = await getNameFor(senderAddress)

        const txId = await getTxForMessage(tokenId)
        messages.push({ tokenId, payload, senderAddress, senderName, txId, encryptedMessage })
      }
      catch (err) { }
    }

    return messages
  }

  async function getTxForMessage(tokenId) {
    const setNameEvent = connex.thor.account(contractAddress).event(abiByName.Transfer)
    const [event] = await setNameEvent.filter([{ tokenId }])
      .order('desc')
      .apply(0, 1)

    if (!event) {
      throw new Error(`No Message found for ${tokenId}`)
    }

    return event.meta.txID
  }

  async function sendMessage(to, text) {
    const setNameEvent = connex.thor.account(contractAddress).event(abiByName.SetName)
    const [event] = await setNameEvent.filter([{ userAddress: to }])
      .apply(0, 1)

    if (!event) {
      throw new Error(`No Registration found for ${to}`)
    }

    const [publicKey] = await getPublicKeyForSenderOfTransactionId(event.meta.txID)
    const encryptedMessageForRecipient = await encryptMessageForBy(text, publicKey, wallet.privateKey)
    const encryptedMessageForSender = await encryptMessageForBy(text, EthCrypto.publicKeyByPrivateKey(wallet.privateKey), wallet.privateKey)

    const clauses = []
    const clauseForRecipient = await connex.thor.account(contractAddress).method(abiByName.safeMint).asClause(to, encryptedMessageForRecipient)
    clauses.push(clauseForRecipient)

    if ( to !== wallet.address ) {
      const clauseForSender = await connex.thor.account(contractAddress).method(abiByName.safeMint).asClause(wallet.address, encryptedMessageForSender)
      clauses.push(clauseForSender)
    }

    const txId = await signTransactionWithPrivateKey(clauses)
    await waitForTransactionId(txId)
  }


  async function deleteMessage(tokenId) {
    const clause = await connex.thor.account(contractAddress).method(abiByName.burn).asClause(tokenId)
    const txId = await signTransactionWithPrivateKey([clause])
    await waitForTransactionId(txId)
  }

  async function getPublicKeyForSenderOfTransactionId(txId) {
    const getRawTransaction = bent(`${NETWORK_URL}/transactions`, 'GET', 'json')
    const { raw } = await getRawTransaction(`/${txId}?raw=true`)

    const transaction = Transaction.decode(raw)
    const hash = transaction.signingHash()
    const signatures = transaction.signature.toString('hex').match(/(.{1,130})/g)

    return signatures.map(signature => secp256k1.recover(Buffer.from(hash, 'hex'), Buffer.from(signature, 'hex')).toString('hex').slice(2))
  }


  async function encryptMessageForBy(message, publicKey, privateKey) {
    const signature = EthCrypto.sign(
      privateKey,
      EthCrypto.hash.keccak256(message)
    );
    const payload = { message, signature };

    const encrypted = await EthCrypto.encryptWithPublicKey(
      publicKey,
      JSON.stringify(payload)
    );

    return EthCrypto.cipher.stringify(encrypted);
  }

  async function decryptMessageFor(encryptedString, privateKey) {
    const encryptedObject = EthCrypto.cipher.parse(encryptedString);
    const decrypted = await EthCrypto.decryptWithPrivateKey(
      privateKey,
      encryptedObject
    );

    const payload = JSON.parse(decrypted);

    const senderAddress = EthCrypto.recover(
      payload.signature,
      EthCrypto.hash.keccak256(payload.message)
    );

    return { payload, senderAddress }
  }

  async function signTransactionWithPrivateKey(clauses) {
    const post = bent("POST", "json");
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
    });

    // build hex encoded version of the transaction for signing request
    const rawTransaction = `0x${transaction.encode().toString("hex")}`;

    // request to send for sponsorship/fee delegation
    const sponsorRequest = {
      origin: wallet.address,
      raw: rawTransaction
    };

    // request sponsorship
    const { signature, error } = await post(DELEGATE_URL, sponsorRequest);

    // sponsorship was rejected
    if (error) {
      throw new Error(error);
    }

    // sign transaction with the known private key
    const signingHash = transaction.signingHash();
    const originSignature = secp256k1.sign(
      signingHash,
      Buffer.from(wallet.privateKey.slice(2), "hex")
    );

    // build combined signature from both parties
    const sponsorSignature = Buffer.from(signature.substr(2), "hex");
    transaction.signature = Buffer.concat([originSignature, sponsorSignature]);

    // post transaction to node
    const signedTransaction = `0x${transaction.encode().toString("hex")}`;
    const { id } = await post(`${NETWORK_URL}/transactions`, { raw: signedTransaction });

    return id;
  }


  const waitForTransactionId = async function waitForTransactionId(id) {
    message.loading(<>waiting for transaction <Typography.Link href={`${EXPLORER_URL}/transactions/${id}`} rel="noreferrer" target='_blank'>{id.slice(0, 4)}…{id.slice(-4)}</Typography.Link></>, 10)
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
    message.success(`transaction successful`)

    return transaction
  }

  return {
    getNameFor,
    setName,
    getMessagesFor,
    sendMessage,
    deleteMessage,
    connex
  }
}


