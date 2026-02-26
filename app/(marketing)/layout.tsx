import MarketingNav from '@/components/marketing-nav'
import MarketingFooter from '@/components/marketing-footer'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="m-page noise-overlay">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  )
}
