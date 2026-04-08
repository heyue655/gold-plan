import { useLocation, useNavigate } from 'react-router-dom'
import { Box, Paper, Typography } from '@mui/material'
import { ButtonBase } from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import PersonIcon from '@mui/icons-material/Person'

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  const current =
    location.pathname === '/my'
      ? 'my'
      : location.pathname === '/repayments'
      ? 'repayments'
      : location.pathname === '/finance'
      ? 'finance'
      : 'home'

  const iconColor = (tab) => current === tab ? 'primary.main' : 'text.disabled'
  const textColor = (tab) => current === tab ? 'primary.main' : 'text.secondary'

  const tabSx = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 0.4,
    cursor: 'pointer',
  }

  return (
    <Paper
      elevation={4}
      sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100 }}
    >
      <Box sx={{ display: 'flex', height: 60, alignItems: 'center' }}>
        {/* 首页 */}
        <ButtonBase onClick={() => navigate('/')} sx={tabSx}>
          <HomeIcon fontSize="small" sx={{ color: iconColor('home') }} />
          <Typography variant="caption" sx={{ fontSize: '0.68rem', color: textColor('home') }}>
            首页
          </Typography>
        </ButtonBase>

        {/* 还款 */}
        <ButtonBase onClick={() => navigate('/repayments')} sx={tabSx}>
          <CreditCardIcon fontSize="small" sx={{ color: iconColor('repayments') }} />
          <Typography variant="caption" sx={{ fontSize: '0.68rem', color: textColor('repayments') }}>
            还款
          </Typography>
        </ButtonBase>

        {/* 账房 */}
        <ButtonBase onClick={() => navigate('/finance')} sx={tabSx}>
          <AccountBalanceIcon fontSize="small" sx={{ color: iconColor('finance') }} />
          <Typography variant="caption" sx={{ fontSize: '0.68rem', color: textColor('finance') }}>
            账房
          </Typography>
        </ButtonBase>

        {/* 我的 */}
        <ButtonBase onClick={() => navigate('/my')} sx={tabSx}>
          <PersonIcon fontSize="small" sx={{ color: iconColor('my') }} />
          <Typography variant="caption" sx={{ fontSize: '0.68rem', color: textColor('my') }}>
            我的
          </Typography>
        </ButtonBase>
      </Box>
    </Paper>
  )
}
