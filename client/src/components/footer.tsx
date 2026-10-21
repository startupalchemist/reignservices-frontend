import { Link } from "wouter";
import logoMark from "@assets/IMG_8426_1773978350170.png";

const navLinks = [
  { label: "Services", href: "/services" },
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

const serviceLinks = [
  { label: "Custom Turf Design & Install", href: "/custom-turf-install" },
  { label: "Foundation Repair", href: "/foundation-repair" },
  { label: "Interior Remodeling", href: "/interior-remodeling" },
  { label: "Outdoor Remodeling", href: "/outdoor-remodeling" },
  { label: "Outdoor Living Spaces", href: "/outdoor-living" },
  { label: "Turf & Pavers", href: "/turf-and-pavers" },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#0B0B0D]" data-testid="footer">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img src={logoMark} alt="Reign Services" className="h-10 w-auto opacity-70" />
              <div>
                <span className="text-[#F5F5F7] font-bold tracking-[0.18em] text-sm uppercase block"
                  style={{ fontFamily: "Poppins, sans-serif" }}>
                  Reign Services
                </span>
                <span className="text-[#B3B3B8]/50 text-[10px] tracking-widest uppercase">
                  DFW's Premier Interior/Exterior Renovations Experts
                </span>
              </div>
            </div>
            <p className="text-[#B3B3B8]/60 text-xs leading-relaxed max-w-xs mt-4">
              Interior and exterior renovation specialists serving the Dallas-Fort Worth metroplex. Residential and commercial projects across North Texas.
            </p>
            <div className="mt-6">
              <Link href="/contact?utm_source=footer&utm_medium=cta&utm_campaign=sitewide">
                <span className="inline-block text-xs uppercase tracking-[0.15em] font-semibold text-[#5D3FD3] hover:text-[#7a5ce8] transition-colors cursor-pointer border border-[#5D3FD3]/40 px-4 py-2 rounded-sm hover:border-[#5D3FD3]/70">
                  Book Free Assessment
                </span>
              </Link>
            </div>

            <div className="mt-8 bg-transparent">
              <a
                href="https://tachyonbuilt.com"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-truetrade-footer"
                className="inline-block bg-transparent"
              >
                <img
                  src="/truetrade-certified-nobg.png"
                  alt="TrueTrade Certified 11.7"
                  className="h-20 w-auto opacity-90 hover:opacity-100 transition-opacity bg-transparent"
                  style={{ background: "transparent", mixBlendMode: "normal" }}
                />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-[#5D3FD3] font-semibold mb-4">
              Services
            </h4>
            <ul className="space-y-2">
              {serviceLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>
                    <span
                      className="text-[#B3B3B8]/60 hover:text-[#F5F5F7] text-xs transition-colors duration-300 cursor-pointer"
                      data-testid={`link-footer-service-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-[#5D3FD3] font-semibold mb-4">
              Navigate
            </h4>
            <ul className="space-y-2">
              {navLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>
                    <span
                      className="text-[#B3B3B8]/60 hover:text-[#F5F5F7] text-xs transition-colors duration-300 cursor-pointer"
                      data-testid={`link-footer-${item.label.toLowerCase()}`}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <h4 className="text-xs uppercase tracking-[0.2em] font-semibold mb-2" style={{ color: "#4a6fa5" }}>
                Service Area
              </h4>
              <p className="text-[#B3B3B8]/50 text-xs leading-relaxed">
                Dallas · Fort Worth · Plano · Frisco · McKinney · Arlington · Irving · Denton · Garland
              </p>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[#B3B3B8]/40 text-xs tracking-wide">
              {new Date().getFullYear()} Reign Services. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link href="/login">
                <span className="text-[#B3B3B8]/30 hover:text-[#B3B3B8]/60 text-xs tracking-wide transition-colors duration-300 cursor-pointer" data-testid="link-footer-login">
                  Admin
                </span>
              </Link>
              <p className="text-[#B3B3B8]/30 text-xs tracking-wide">
                DFW's Premier Interior/Exterior Renovations Experts
              </p>
            </div>
          </div>

          <div className="pt-1 text-center sm:text-left space-y-1" data-testid="text-footer-attribution">
            <p className="text-[#B3B3B8]/45 text-xs tracking-wide">
              LaunchWorks <span className="text-[#B3B3B8]/30">by Ocotillo Intelligence</span>
            </p>
            <p className="text-[#B3B3B8]/30 text-[10px] tracking-wide">Engineered by TachyonXLabs</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
