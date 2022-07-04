import "antd/dist/antd.css";
import { useState } from 'react'
import { Col, Row } from 'antd'
import Accounts from './Accounts'
import Messages from './Messages'

function App() {
  const [selectedAccount, setSelectedAccount] = useState()

  return (
    <Row gutter={[16, 16]}>
      <Col offset={2} span={20}><Accounts onSelect={setSelectedAccount} /></Col>
      <Col offset={2} span={20}><Messages account={selectedAccount} /></Col>
    </Row >
  );
}

export default App;
