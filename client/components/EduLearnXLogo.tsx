import { Link } from "react-router-dom";

type EduLearnXLogoProps = {
  to?: string;
  compact?: boolean;
  className?: string;
};

export default function EduLearnXLogo({
  to = "/",
  compact = false,
  className = "",
}: EduLearnXLogoProps) {
  const logo = (
    <span
      className={`inline-flex ${compact ? "h-16 w-36 sm:h-20 sm:w-44" : "h-24 w-48 sm:h-28 sm:w-56"} overflow-hidden ${className}`}
    >
      <img
        src="/logo.png"
        alt="EduLearnX"
        className="h-full w-full object-cover object-center"
      />
    </span>
  );

  if (!to) {
    return logo;
  }

  return (
    <Link to={to} className="inline-flex items-center" aria-label="EduLearnX home">
      {logo}
    </Link>
  );
}
