// Bundled, so the file is content-hashed under /assets/ and cached immutably.
import logo from '../../shared/ui/assets/images/logo.png'

type BrandLogoProps = {
  className?: string
  size?: number
  /** Lightens against a dark background (the login page); off on a light one. */
  blend?: boolean
}

/** Cube mark used on the login screen. */
export function BrandLogo({ className = '', size = 52, blend = true }: BrandLogoProps) {
  return (
    <img
      src={logo}
      alt="Beyond Code"
      width={size}
      height={size}
      className={`object-contain ${blend ? 'mix-blend-lighten' : ''} ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
