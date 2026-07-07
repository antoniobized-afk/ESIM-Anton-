'use client'

import { forwardRef, useEffect, useState } from 'react'
import type { CSSProperties, ForwardedRef, SVGProps } from 'react'
import {
  Apple as LucideApple,
  AlertCircle as LucideAlertCircle,
  ArrowLeft as LucideArrowLeft,
  ArrowRight as LucideArrowRight,
  Ban as LucideBan,
  Bell as LucideBell,
  Check as LucideCheck,
  CheckCircle as LucideCheckCircle,
  CheckCircle2 as LucideCheckCircle2,
  ChevronDown as LucideChevronDown,
  ChevronLeft as LucideChevronLeft,
  ChevronRight as LucideChevronRight,
  ChevronUp as LucideChevronUp,
  Clock as LucideClock,
  Copy as LucideCopy,
  CreditCard as LucideCreditCard,
  DollarSign as LucideDollarSign,
  Download as LucideDownload,
  FileText as LucideFileText,
  Gift as LucideGift,
  Globe as LucideGlobe,
  HelpCircle as LucideHelpCircle,
  Info as LucideInfo,
  Laptop as LucideLaptop,
  Loader2 as LucideLoader2,
  LogOut as LucideLogOut,
  Mail as LucideMail,
  MapPin as LucideMapPin,
  MessageCircle as LucideMessageCircle,
  Monitor as LucideMonitor,
  Moon as LucideMoon,
  Phone as LucidePhone,
  Play as LucidePlay,
  Plus as LucidePlus,
  QrCode as LucideQrCode,
  RefreshCw as LucideRefreshCw,
  Search as LucideSearch,
  Share2 as LucideShare2,
  Shield as LucideShield,
  ShoppingBag as LucideShoppingBag,
  Smartphone as LucideSmartphone,
  Store as LucideStore,
  Sun as LucideSun,
  Tablet as LucideTablet,
  Tag as LucideTag,
  TrendingUp as LucideTrendingUp,
  User as LucideUser,
  Users as LucideUsers,
  Wallet as LucideWallet,
  Wifi as LucideWifi,
  WifiOff as LucideWifiOff,
  X as LucideX,
  XCircle as LucideXCircle,
} from 'lucide-react'

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string
  absoluteStrokeWidth?: boolean
}

function ClientOnlyIcon(Icon: any) {
  return forwardRef<SVGSVGElement, IconProps>(function WrappedIcon(
    { size = 24, className, style, ...props },
    ref,
  ) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
      setMounted(true)
    }, [])

    if (!mounted) {
      const numericSize = typeof size === 'number' ? size : Number(size) || 24
      const placeholderStyle: CSSProperties = {
        display: 'inline-block',
        width: numericSize,
        height: numericSize,
        flexShrink: 0,
        ...style,
      }

      return <span aria-hidden="true" className={className} style={placeholderStyle} />
    }

    return <Icon ref={ref as ForwardedRef<SVGSVGElement>} size={size} className={className} style={style} {...props} />
  })
}

export const Apple = ClientOnlyIcon(LucideApple)
export const AlertCircle = ClientOnlyIcon(LucideAlertCircle)
export const ArrowLeft = ClientOnlyIcon(LucideArrowLeft)
export const ArrowRight = ClientOnlyIcon(LucideArrowRight)
export const Ban = ClientOnlyIcon(LucideBan)
export const Bell = ClientOnlyIcon(LucideBell)
export const Check = ClientOnlyIcon(LucideCheck)
export const CheckCircle = ClientOnlyIcon(LucideCheckCircle)
export const CheckCircle2 = ClientOnlyIcon(LucideCheckCircle2)
export const ChevronDown = ClientOnlyIcon(LucideChevronDown)
export const ChevronLeft = ClientOnlyIcon(LucideChevronLeft)
export const ChevronRight = ClientOnlyIcon(LucideChevronRight)
export const ChevronUp = ClientOnlyIcon(LucideChevronUp)
export const Clock = ClientOnlyIcon(LucideClock)
export const Copy = ClientOnlyIcon(LucideCopy)
export const CreditCard = ClientOnlyIcon(LucideCreditCard)
export const DollarSign = ClientOnlyIcon(LucideDollarSign)
export const Download = ClientOnlyIcon(LucideDownload)
export const FileText = ClientOnlyIcon(LucideFileText)
export const Gift = ClientOnlyIcon(LucideGift)
export const Globe = ClientOnlyIcon(LucideGlobe)
export const HelpCircle = ClientOnlyIcon(LucideHelpCircle)
export const Info = ClientOnlyIcon(LucideInfo)
export const Laptop = ClientOnlyIcon(LucideLaptop)
export const Loader2 = ClientOnlyIcon(LucideLoader2)
export const LogOut = ClientOnlyIcon(LucideLogOut)
export const Mail = ClientOnlyIcon(LucideMail)
export const MapPin = ClientOnlyIcon(LucideMapPin)
export const MessageCircle = ClientOnlyIcon(LucideMessageCircle)
export const Monitor = ClientOnlyIcon(LucideMonitor)
export const Moon = ClientOnlyIcon(LucideMoon)
export const Phone = ClientOnlyIcon(LucidePhone)
export const Play = ClientOnlyIcon(LucidePlay)
export const Plus = ClientOnlyIcon(LucidePlus)
export const QrCode = ClientOnlyIcon(LucideQrCode)
export const RefreshCw = ClientOnlyIcon(LucideRefreshCw)
export const Search = ClientOnlyIcon(LucideSearch)
export const Share2 = ClientOnlyIcon(LucideShare2)
export const Shield = ClientOnlyIcon(LucideShield)
export const ShoppingBag = ClientOnlyIcon(LucideShoppingBag)
export const Smartphone = ClientOnlyIcon(LucideSmartphone)
export const Store = ClientOnlyIcon(LucideStore)
export const Sun = ClientOnlyIcon(LucideSun)
export const Tablet = ClientOnlyIcon(LucideTablet)
export const Tag = ClientOnlyIcon(LucideTag)
export const TrendingUp = ClientOnlyIcon(LucideTrendingUp)
export const User = ClientOnlyIcon(LucideUser)
export const Users = ClientOnlyIcon(LucideUsers)
export const Wallet = ClientOnlyIcon(LucideWallet)
export const Wifi = ClientOnlyIcon(LucideWifi)
export const WifiOff = ClientOnlyIcon(LucideWifiOff)
export const X = ClientOnlyIcon(LucideX)
export const XCircle = ClientOnlyIcon(LucideXCircle)
