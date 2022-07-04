import { useCallback } from 'react'
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

const contract = connex.thor.account(contractAddress)

export function useContract({ wallet } = {}) {

  const getNameFor = useCallback(async function getNameFor(address) {
    const { decoded: { '0': name } } = await contract.method(abiByName.nameByAddress).call(address)
    return name
  }, [])

  async function setName(newName) {
    const clause = contract.method(abiByName.setName).asClause(newName)
    const txId = await sendTransactionWithWallet([clause], wallet)
    await waitForTransactionId(txId)
  }

  async function getMessages() {
    const messages = []

    // get current count of tokens
    const { decoded: { '0': count } } = await contract.method(abiByName.balanceOf).call(wallet.address)

    // loop thru each token and get details
    for (let index = 0; index < count; index++) {

      // get the token id of each owned token
      const { decoded: { '0': tokenId } } = await contract.method(abiByName.tokenOfOwnerByIndex).call(wallet.address, index)

      // read the tokenURI that containts the encrypted message
      const { decoded: { '0': encryptedMessage } } = await contract.method(abiByName.tokenURI).call(tokenId)

      try {
        // decrypt mesage using the local wallets private key
        const { payload, senderAddress } = await decryptMessageFor(encryptedMessage, wallet.privateKey)

        // for user readability, get the "registered" name of the sender
        const senderName = await getNameFor(senderAddress)

        // for debbuging purpose, get transaction id
        const txId = await getTxForMessage(tokenId)

        messages.push({ tokenId, payload, senderAddress, senderName, txId, encryptedMessage })
      }
      catch (err) {
        console.error(err)
      }
    }

    return messages
  }

  async function getTxForMessage(tokenId) {
    const setNameEvent = contract.event(abiByName.Transfer)
    const [event] = await setNameEvent.filter([{ tokenId }]).order('desc').apply(0, 1)

    if (!event) {
      throw new Error(`No Message found for ${tokenId}`)
    }

    return event.meta.txID
  }

  async function sendMessage(to, text) {
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


  async function deleteMessage(tokenId) {
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



async function decryptMessageFor(encryptedString, privateKey) {
  // restore encrypted object from hex string
  const encryptedObject = EthCrypto.cipher.parse(encryptedString);

  // decrypt data with private key
  const decrypted = await EthCrypto.decryptWithPrivateKey(privateKey, encryptedObject);

  // restore object from the JSON string
  const payload = JSON.parse(decrypted);

  // extract the sender address using the signature and the now known message
  const senderAddress = EthCrypto.recover(payload.signature, EthCrypto.hash.keccak256(payload.message));

  // return the result
  return { payload, senderAddress }
}



async function encryptMessageForBy(message, publicKey, privateKey) {
  // sign message with private key …
  const signature = EthCrypto.sign(privateKey, EthCrypto.hash.keccak256(message));

  // … and embed sender information
  const payload = JSON.stringify({ message, signature });

  // encrypt the message for the given public key
  const encrypted = await EthCrypto.encryptWithPublicKey(publicKey, payload);

  // return a simple string for further processing
  return EthCrypto.cipher.stringify(encrypted);
}



async function getTransactionIdForAddress(userAddress) {
  const setNameEvent = contract.event(abiByName.SetName)
  const [event] = await setNameEvent.filter([{ userAddress }])
    .apply(0, 1)

  if (!event) {
    throw new Error(`No Registration found for ${userAddress}`)
  }

  return event.meta.txID
}


async function getPublicKeyForSenderOfTransactionId(txId) {
  const getRawTransaction = bent(`${NETWORK_URL}/transactions`, 'GET', 'json')
  const { raw } = await getRawTransaction(`/${txId}?raw=true`)

  const transaction = Transaction.decode(raw)
  const hash = transaction.signingHash()
  const signatures = transaction.signature.toString('hex').match(/(.{1,130})/g)

  return signatures.map(signature => secp256k1.recover(Buffer.from(hash, 'hex'), Buffer.from(signature, 'hex')).toString('hex').slice(2))
}




async function sendTransactionWithWallet(clauses, wallet) {
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


async function waitForTransactionId(id) {
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