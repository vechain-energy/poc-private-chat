import EthCrypto from 'eth-crypto'

export async function decryptMessageFor (encryptedString, privateKey) {
  // restore encrypted object from hex string
  const encryptedObject = EthCrypto.cipher.parse(encryptedString)

  // decrypt data with private key
  const decrypted = await EthCrypto.decryptWithPrivateKey(privateKey, encryptedObject)

  // restore object from the JSON string
  const payload = JSON.parse(decrypted)

  // extract the sender address using the signature and the now known message
  const senderAddress = EthCrypto.recover(payload.signature, EthCrypto.hash.keccak256(payload.message))

  // return the result
  return { payload, senderAddress }
}

export async function encryptMessageForBy (message, publicKey, privateKey) {
  // sign message with private key …
  const signature = EthCrypto.sign(privateKey, EthCrypto.hash.keccak256(message))

  // … and embed sender information
  const payload = JSON.stringify({ message, signature })

  // encrypt the message for the given public key
  const encrypted = await EthCrypto.encryptWithPublicKey(publicKey, payload)

  // return a simple string for further processing
  return EthCrypto.cipher.stringify(encrypted)
}
