import { useState, useEffect, useCallback } from 'react'
import { Button, Input, Typography, Comment, List, Form, Alert, Card, Row, Col, Popconfirm } from 'antd'
import Avatar from '../Accounts/Avatar'
import { useContract } from '../hooks/useContract'
import { DeleteOutlined, MessageOutlined } from '@ant-design/icons'

const { Text, Paragraph, Link } = Typography
const { TextArea } = Input
const EXPLORER_URL = process.env.EXPLORER_URL || 'https://explore-testnet.vechain.org'

export default function MessageList ({ account }) {
  const { getMessages, sendMessage, deleteMessage, setName, getNameFor } = useContract(account)
  const [profile, setProfile] = useState({})
  const [messages, setMessages] = useState([])
  const [text, setText] = useState()
  const [to, setTo] = useState()
  const [username, setUsername] = useState()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState()

  const fetchProfile = useCallback(async function () {
    const name = await getNameFor(account.address)
    setProfile({ name, address: account?.address })
    setTo(account?.address)
  }, [getNameFor, account])

  async function handleSetUsername () {
    setLoading(true)
    await setName(username)
    await fetchProfile()
    setLoading(false)
  }

  const handleRemove = (tokenId) => async () => {
    setLoading(true)
    await deleteMessage(tokenId)
    await fetchMessages()
    setLoading(false)
  }

  const fetchMessages = useCallback(async function () {
    setLoading(true)
    const messages = await getMessages()
    setMessages(messages)
    setLoading(false)
  }, [getMessages])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  async function handleSendMessage () {
    setError()
    setLoading(true)
    try {
      await sendMessage(to, text)
      await fetchMessages()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  if (!profile.name) {
    return (
      <Row gutter={[16, 16]}>
        <Col span={24}><Text strong>Welcome {account?.address}, what is your name?</Text></Col>
        <Col span={20}>
          <Input placeholder='set your username' onChange={(e) => setUsername(e.target.value)} />
        </Col>
        <Col span={4}>
          <Button block type='primary' onClick={handleSetUsername} loading={loading}>set username</Button>
        </Col>
      </Row>
    )
  }

  return (
    <>
      {!!error && <Alert message={error} type='error' closable />}
      <Card title={`Welcome ${profile.name}`}>
        <List
          dataSource={messages}
          header={`${messages.length} ${messages.length > 1 ? 'Messages' : 'Message'}`}
          itemLayout='horizontal'
          locale={{ emptyText: <></> }}
          loading={loading}
          renderItem={({ tokenId, payload, senderAddress, senderName, txId, encryptedMessage }) => (
            <Comment
              author={<Text>{senderAddress === account.address ? 'sent to' : 'received from'} {senderName || senderAddress}</Text>}
              avatar={<Avatar address={senderAddress} />}
              content={(
                <>
                  <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{payload.message}</Paragraph>
                  <Paragraph type='secondary' style={{ whiteSpace: 'pre-wrap' }}><small>Encrypted version: {encryptedMessage}</small></Paragraph>
                </>
              )}
              datetime={<> Message #{tokenId} in Tx <Link href={`${EXPLORER_URL}/transactions/${txId}#clauses`} target='_blank' rel='noreferrer'> {txId}</Link></>}
              actions={[
                <Popconfirm
                  key='remove'
                  title='Delete Message'
                  onConfirm={handleRemove(tokenId)}
                >
                  <Button danger size='small' type='link' icon={<DeleteOutlined />} />
                </Popconfirm>,
                <Button key='reply' size='small' type='link' onClick={() => setTo(senderAddress)} icon={<MessageOutlined />}>reply</Button>

              ]}
            />
          )}
        />
      </Card>
      <br />
      <Card title='Send new message'>
        <Comment
          avatar={<Avatar alt={account.address}>{account.address.slice(-3)}</Avatar>}
          content={
            <>
              <Form.Item>
                <Input onChange={(e) => setTo(e.target.value)} value={to} placeholder='Send message to 0x…' />
              </Form.Item>
              <Form.Item>
                <TextArea rows={4} onChange={(e) => setText(e.target.value)} value={text} placeholder='Message to send' />
              </Form.Item>
              <Form.Item>
                <Button htmlType='submit' loading={loading} onClick={handleSendMessage} type='primary'>
                  Send Message
                </Button>
              </Form.Item>
            </>
          }
        />
      </Card>
    </>
  )
}
