import { picasso } from '../common/picasso'
import { Avatar } from 'antd'

export default function CustomAvatar ({ address, size = 32 }) {
  if (!address) { return }

  return (
    <Avatar
      size={size}
      src={
        <div style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundImage: `url('data:image/svg+xml;utf8,${picasso(address)}')`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover'
        }}
        />
      }
    />
  )
}
