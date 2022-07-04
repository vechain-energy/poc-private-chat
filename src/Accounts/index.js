import { useState, useEffect, useCallback } from 'react'
import { Button, List, Typography, Popconfirm } from 'antd'
import { DeleteOutlined, CheckOutlined, UserAddOutlined } from '@ant-design/icons';
import Avatar from './Avatar'
import { useAccounts } from '../hooks/useAccounts'
import { useContract } from '../hooks/useContract'

const { Text } = Typography

export default function Accounts({ onSelect, account: selectedAccount }) {
  const { accounts, add, remove } = useAccounts()
  const { getNameFor } = useContract()
  const [accountsWithNames, setAccountsWithNames] = useState([])

  const handleSelect = useCallback((account) => () => onSelect(account), [onSelect])
  const handleRemove = ({ privateKey: privateKeyToRemove }) => () => remove(privateKeyToRemove)
  const loadNames = useCallback(async () => {
    const accountsWithNames = []
    for (const account of accounts) {
      const name = await getNameFor(account.address)
      accountsWithNames.push({ ...account, name })
    }
    setAccountsWithNames(accountsWithNames)
  }, [getNameFor, accounts])

  useEffect(() => {
    loadNames()
  }, [loadNames])


  return (
    <List
      header={<>Accounts</>}
      itemLayout="horizontal"
      dataSource={accountsWithNames}
      loadMore={<Button type='link' onClick={add} icon={<UserAddOutlined />}>add new account</Button>}
      renderItem={account => (
        <List.Item
          actions={[
            <Popconfirm
              key='remove'
              title="Delete Account"
              onConfirm={handleRemove(account)}
            >
              <Button danger type='text' shape="circle" icon={<DeleteOutlined />} />
            </Popconfirm>,
            <Button key='select' type={selectedAccount?.address === account.address ? 'primary' : 'secondary'} shape="circle" onClick={handleSelect(account)}>{selectedAccount?.address === account.address ? <CheckOutlined /> : ' '}</Button>
          ]}
        >
          <List.Item.Meta
            avatar={<Avatar address={account.address} />}
            onClick={handleSelect(account)}
            title={
              account.name
                ?
                <Text>{account.name} <small><Text type='secondary' copyable>{account.address}</Text></small></Text>
                :

                <Text>Not signed up yet <small><Text type='secondary' copyable>{account.address}</Text></small></Text>
            }
          />
        </List.Item>
      )}
    />
  )
}
