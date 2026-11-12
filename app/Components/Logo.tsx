"use client";

import Image from "next/image";
import Link from "next/link";
import logo from "@/media/SimliLogoV2.svg";
import cn from "@/app/utils/TailwindMergeAndClsx";

interface Props {
  className?: string;
}

// Full reload on click: clicking the logo resets the demo, as before (this app has a single page).
const SimliHeaderLogo = ({ className }: Props) => (
  <Link
    href="/"
    onClick={(e) => {
      e.preventDefault();
      window.location.reload();
    }}
    className={cn("cursor-pointer", className)}
  >
    <Image src={logo} className="Logo" alt="Simli logo" priority />
  </Link>
);

export default SimliHeaderLogo;
