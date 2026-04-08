import { Box } from '@mui/material'
import BottomNav from './BottomNav'

export default function Layout({ children }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: 'background.default',
      }}
    >
      <Box sx={{ flex: 1, pb: '64px' }}>
        {children}
      </Box>
      <BottomNav />
    </Box>
  )
}
