import List from './List'

export default function Messages ({ account, addresses }) {
  if (!account) {
    return <>Please select an Account above</>
  }

  return (
    <List account={account} addresses={addresses} />
  )
}
