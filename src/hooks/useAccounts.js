import { useState, useEffect } from 'react'
import { ethers } from '@vechain/ethers'

export function useAccounts () {
  const [privateKeys, setPrivateKeys] = useState(String(window.localStorage.getItem('privateKeys') || '').split(','))
  const [accounts, setAccounts] = useState([])

  function add () {
    const { privateKey } = ethers.Wallet.createRandom()
    setPrivateKeys(privateKeys => [...privateKeys, privateKey])
  }

  function remove (privateKeyToRemove) {
    setPrivateKeys(privateKeys => privateKeys.filter(privateKey => privateKey !== privateKeyToRemove))
  }

  function buildAccountList () {
    const accounts = privateKeys
      .filter(privateKey => !!privateKey)
      .map(privateKey => {
        const wallet = new ethers.Wallet(privateKey)
        return {
          privateKey,
          address: wallet.address,
          wallet
        }
      })

    setAccounts(accounts)
    window.localStorage.setItem('privateKeys', privateKeys.join(','))

    if (!accounts.length) {
      add()
    }
  }

  useEffect(buildAccountList, [privateKeys])

  return {
    add,
    remove,
    accounts
  }
}
