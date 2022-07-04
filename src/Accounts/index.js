import { useState, useEffect, useCallback } from 'react'
import { Button, List, Typography, Popconfirm } from 'antd'
import { DeleteOutlined, CheckOutlined, UserAddOutlined } from '@ant-design/icons';
import Avatar from './Avatar'
import { useContract } from '../hooks/useContract'

const { ethers } = require("@vechain/ethers");
const { Text } = Typography

export default function Accounts({ onSelect }) {
  const [privateKeys, setPrivateKeys] = useState(String(window.localStorage.getItem('privateKeys') || '').split(','))
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState()
  const { getNameFor } = useContract(selectedAccount)

  const handleAdd = () => {
    const { privateKey } = ethers.Wallet.createRandom();
    setPrivateKeys(privateKeys => [...privateKeys, privateKey])
  }

  const handleRemove = (privateKeyToRemove) => () => {
    setPrivateKeys(privateKeys => privateKeys.filter(privateKey => privateKey !== privateKeyToRemove))
  }

  const handleSelect = (privateKeyToSelect) => () => {
    setSelectedAccount(accounts.find(({ privateKey }) => privateKey === privateKeyToSelect))
  }

  const buildAccountList = useCallback(async function () {
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

    for (const accountIndex in accounts) {
      const name = await getNameFor(accounts[accountIndex].address)
      accounts[accountIndex].name = name
    }

    setAccounts(accounts)
    window.localStorage.setItem('privateKeys', privateKeys.join(','))

    if (!accounts.length) {
      handleAdd()
    }

    if (accounts.length === 1) {
      setSelectedAccount(accounts[0])
    }
  }, [privateKeys, getNameFor])

  useEffect(() => {
    buildAccountList()
  }, [buildAccountList])

  useEffect(() => {
    if (onSelect) { onSelect(selectedAccount) }
  }, [selectedAccount, onSelect])

  return (
    <List
      header={<>Accounts</>}
      itemLayout="horizontal"
      dataSource={accounts}
      loadMore={<Button type='link' onClick={handleAdd} icon={<UserAddOutlined />}>add new account</Button>}
      renderItem={({ name, address, privateKey }) => (
        <List.Item
          actions={[
            <Popconfirm
              key='remove'
              title="Delete Account"
              onConfirm={handleRemove(privateKey)}
            >
              <Button danger type='text' shape="circle" icon={<DeleteOutlined />} />
            </Popconfirm>,
            <Button key='select' type={selectedAccount?.address === address ? 'primary' : 'secondary'} shape="circle" onClick={handleSelect(privateKey)}>{selectedAccount?.address === address ? <CheckOutlined /> : ' '}</Button>
          ]}
        >

          <List.Item.Meta
            avatar={<Avatar address={address} />}
            onClick={handleSelect(privateKey)}
            title={
              name
                ?
                <Text>{name} <small><Text type='secondary' copyable>{address}</Text></small></Text>
                :

                <Text>Not signed up yet <small><Text type='secondary' copyable>{address}</Text></small></Text>
            }
          />
        </List.Item>
      )}
    />
  )
}
