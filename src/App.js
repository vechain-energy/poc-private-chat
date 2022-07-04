import 'antd/dist/antd.css'
import { useState } from 'react'
import { Col, Row, Typography } from 'antd'
import Accounts from './Accounts'
import Messages from './Messages'

const { Link, Paragraph } = Typography

function App () {
  const [selectedAccount, setSelectedAccount] = useState()

  return (
    <Row gutter={[16, 16]}>
      <Col offset={2} span={20} align='center'>
        <Paragraph type='secondary'>
          Generate wallets/accounts, send encrypted messages between them and inspect the transaction data to analyze the transferred (encrypted) information.<br />
          All transactions are handled on VeChains TestNet using Fee Delegation with the help of <Link href='https://testnet.vechain.energy' target='_blank' rel='noreferrer'>vechain.energy</Link>.
        </Paragraph>
      </Col>
      <Col offset={2} span={20}><Accounts onSelect={setSelectedAccount} account={selectedAccount} /></Col>
      <Col offset={2} span={20}><Messages account={selectedAccount} /></Col>
    </Row>
  )
}

export default App
